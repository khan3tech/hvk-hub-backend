// Business rules for resignation & exit. Framework-agnostic — no req/res.
// Implements specs/009-resignation-exit/spec.md.
import moment from "moment";
import { DomainError } from "../../middleware/errorHandler.js";
import { getEmployeeSummary, listDirectReportIds, offboardEmployee } from "../employee/service.js";
import { notifyEmployees, notifyRoles } from "../notifications/service.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import type { SubmitResignationRequest } from "./schema.js";

// FR-005: clearance owned by IT, Finance and HR (no login role maps to IT/Finance, so HR/Admin
// complete them on those teams' behalf — research.md R3).
export const DEFAULT_EXIT_TASKS = [
  // 014 FR-006: completed automatically once the employee's assets are all returned.
  { ownerRole: "IT" as const, description: "Collect laptop/assets and revoke system accounts", systemKey: "ASSET_RETURN" },
  { ownerRole: "FINANCE" as const, description: "Process final settlement" },
  { ownerRole: "HR" as const, description: "Conduct exit interview" },
  { ownerRole: "HR" as const, description: "Issue relieving and experience letters" },
];

type Resignation = NonNullable<Awaited<ReturnType<typeof repo.findResignation>>>;

const isPrivileged = (actor: AccessTokenPayload) => actor.role === "HR" || actor.role === "ADMIN";
const day = (d: Date | null) => (d ? moment.utc(d).format("YYYY-MM-DD") : null);

async function audit(orgId: string, actor: AccessTokenPayload, action: string, entityId: string, after?: unknown, before?: unknown) {
  if (!actor.employeeId) return;
  await repo.writeActivityLog({ orgId, actorId: actor.employeeId, action, entity: "Resignation", entityId, before, after });
}

// FR-007: exit-interview notes are HR/Admin only.
function present(r: Resignation, actor: AccessTokenPayload) {
  const base = { ...r, proposedLastDay: day(r.proposedLastDay), confirmedLastDay: day(r.confirmedLastDay) };
  if (isPrivileged(actor)) return base;
  const { exitInterviewNotes: _notes, ...rest } = base;
  return rest;
}

async function requireResignation(orgId: string, id: string) {
  const r = await repo.findResignation(orgId, id);
  if (!r) throw new DomainError("NOT_FOUND", "Resignation not found.", 404);
  return r;
}

// Employee themself, their current manager, or HR/Admin.
async function assertCanView(orgId: string, r: Resignation, actor: AccessTokenPayload) {
  if (isPrivileged(actor) || r.employeeId === actor.employeeId) return;
  const employee = await getEmployeeSummary(orgId, r.employeeId);
  if (actor.role === "MANAGER" && employee?.managerId === actor.employeeId) return;
  throw new DomainError("NOT_FOUND", "Resignation not found.", 404);
}

// --- Submit (US1) ---

export async function submitResignation(orgId: string, input: SubmitResignationRequest, actor: AccessTokenPayload) {
  if (!actor.employeeId) throw new DomainError("FORBIDDEN", "Only employees can resign.", 403);
  const employee = await getEmployeeSummary(orgId, actor.employeeId);
  if (!employee || employee.status !== "ACTIVE") {
    throw new DomainError("FORBIDDEN", "Only active employees can resign.", 403);
  }
  if (moment.utc(input.proposedLastDay).isBefore(moment.utc().startOf("day"))) {
    throw new DomainError("VALIDATION_ERROR", "The last working day can't be in the past.", 400, {
      proposedLastDay: ["Must be today or later."],
    });
  }
  // FR-002: one active (pending or serving-notice) resignation at a time.
  if (await repo.findActiveResignation(orgId, employee.id)) {
    throw new DomainError("RESIGNATION_EXISTS", "You already have an active resignation.", 409);
  }

  const r = await repo.createResignation({
    orgId,
    employeeId: employee.id,
    proposedLastDay: moment.utc(input.proposedLastDay).toDate(),
    reason: input.reason,
  });
  await audit(orgId, actor, "resignation.submitted", r.id, { proposedLastDay: input.proposedLastDay });

  const event = {
    type: "RESIGNATION_SUBMITTED" as const,
    message: `${employee.name} submitted a resignation (proposed last day ${input.proposedLastDay}).`,
    link: `/exit/resignations/${r.id}`,
  };
  if (employee.managerId) await notifyEmployees(orgId, [employee.managerId], event);
  await notifyRoles(orgId, ["HR"], event);
  return present(r, actor);
}

// --- Views ---

export async function getMyResignations(orgId: string, actor: AccessTokenPayload) {
  if (!actor.employeeId) return [];
  const list = await repo.listResignations(orgId, { employeeId: actor.employeeId });
  return list.map((r) => present(r, actor));
}

// HR/Admin: everything (optionally by status); Manager: their current direct reports'.
export async function listResignations(orgId: string, actor: AccessTokenPayload, status?: string) {
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (!isPrivileged(actor)) {
    const reports = actor.employeeId ? await listDirectReportIds(orgId, actor.employeeId) : [];
    where.employeeId = { in: reports };
  }
  const list = await repo.listResignations(orgId, where);
  return list.map((r) => present(r, actor));
}

export async function getResignation(orgId: string, id: string, actor: AccessTokenPayload) {
  const r = await requireResignation(orgId, id);
  await assertCanView(orgId, r, actor);
  return present(r, actor);
}

// --- Acknowledge (US2) ---

export async function acknowledgeResignation(orgId: string, id: string, confirmedLastDay: string | undefined, actor: AccessTokenPayload) {
  const r = await requireResignation(orgId, id);
  const employee = await getEmployeeSummary(orgId, r.employeeId);
  if (!employee) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  const isManager = actor.role === "MANAGER" && employee.managerId === actor.employeeId;
  if (!isPrivileged(actor) && !isManager) {
    throw new DomainError("FORBIDDEN", "Only this employee's manager or HR can acknowledge it.", 403);
  }
  if (r.employeeId === actor.employeeId) {
    throw new DomainError("FORBIDDEN", "You can't acknowledge your own resignation.", 403);
  }

  const lastDay = moment.utc(confirmedLastDay ?? r.proposedLastDay).toDate();
  const { count } = await repo.transition(id, ["PENDING"], {
    status: "SERVING_NOTICE",
    confirmedLastDay: lastDay,
    acknowledgedById: actor.employeeId,
    acknowledgedAt: new Date(),
  });
  if (count === 0) throw new DomainError("INVALID_STATE", "Only a pending resignation can be acknowledged.", 409);

  // FR-005 + FR-009: the checklist, flagging any active direct reports needing a new manager.
  const reportIds = await listDirectReportIds(orgId, employee.id);
  const reports = await Promise.all(
    reportIds.map(async (rid) => ({ id: rid, name: (await getEmployeeSummary(orgId, rid))?.name ?? rid })),
  );
  const tasks: Array<{ ownerRole: "IT" | "FINANCE" | "HR"; description: string; systemKey?: string }> = [...DEFAULT_EXIT_TASKS];
  if (reports.length > 0) {
    tasks.push({ ownerRole: "HR", description: `Reassign ${reports.length} direct report(s) to a new manager` });
  }
  await repo.createChecklist(orgId, id, tasks, reports.length > 0 ? reports : null);

  await audit(orgId, actor, "resignation.acknowledged", id, { status: "SERVING_NOTICE", confirmedLastDay: day(lastDay) }, { status: "PENDING", proposedLastDay: day(r.proposedLastDay) });
  await notifyEmployees(orgId, [employee.id], {
    type: "RESIGNATION_ACKNOWLEDGED",
    message: `Your resignation was acknowledged. Last working day: ${day(lastDay)}.`,
    link: `/exit/resignations/${id}`,
    email: { subject: "Resignation acknowledged", text: `Your resignation was acknowledged. Last working day: ${day(lastDay)}.` },
  });
  return present((await repo.findResignation(orgId, id))!, actor);
}

// --- Withdraw (edge case, FR-008) ---

export async function withdrawResignation(orgId: string, id: string, actor: AccessTokenPayload) {
  await requireResignation(orgId, id);
  const { count } = await repo.transition(id, ["PENDING", "SERVING_NOTICE"], { status: "WITHDRAWN", withdrawnAt: new Date() });
  if (count === 0) throw new DomainError("INVALID_STATE", "Only an active resignation can be withdrawn.", 409);
  await repo.closeChecklist(id);
  await audit(orgId, actor, "resignation.withdrawn", id, { status: "WITHDRAWN" });
  return present((await repo.findResignation(orgId, id))!, actor);
}

// --- Exit interview (FR-007) ---

export async function recordExitInterview(orgId: string, id: string, notes: string, actor: AccessTokenPayload) {
  await requireResignation(orgId, id);
  const updated = await repo.updateResignation(id, { exitInterviewNotes: notes });
  await audit(orgId, actor, "resignation.exit_interview_recorded", id);
  return present(updated, actor);
}

// --- Clearance (US3) ---

function presentChecklist(checklist: NonNullable<Awaited<ReturnType<typeof repo.findChecklistByResignation>>>) {
  return {
    ...checklist,
    remainingCount: checklist.tasks.filter((t) => t.status === "INCOMPLETE").length,
  };
}

// SC-003: one view of what remains.
export async function getChecklist(orgId: string, resignationId: string) {
  await requireResignation(orgId, resignationId);
  const checklist = await repo.findChecklistByResignation(orgId, resignationId);
  if (!checklist) throw new DomainError("NOT_FOUND", "No exit checklist yet — acknowledge the resignation first.", 404);
  return presentChecklist(checklist);
}

// 014 US2.3: another feature can veto manual completion of a tagged task while its real-world
// condition is unmet (e.g. ASSET_RETURN while assets are still assigned). Registered in app.ts.
type ExitTaskGuard = (orgId: string, employeeId: string) => Promise<string | null>;
const taskGuards = new Map<string, ExitTaskGuard>();

export function registerExitTaskGuard(systemKey: string, guard: ExitTaskGuard): void {
  taskGuards.set(systemKey, guard);
}

export async function completeExitTask(orgId: string, taskId: string, actor: AccessTokenPayload) {
  const task = await repo.findTask(orgId, taskId);
  if (!task) throw new DomainError("NOT_FOUND", "Exit task not found.", 404);
  if (task.checklist.closedAt) throw new DomainError("CHECKLIST_CLOSED", "This exit checklist was closed.", 409);
  const guard = task.systemKey ? taskGuards.get(task.systemKey) : undefined;
  const blocked = guard ? await guard(orgId, task.checklist.resignation.employeeId) : null;
  if (blocked) throw new DomainError("TASK_BLOCKED", blocked, 409);
  if (!actor.employeeId) throw new DomainError("FORBIDDEN", "Your account has no employee record to attribute this to.", 403);
  const { count } = await repo.completeTask(taskId, actor.employeeId);
  if (count === 0) throw new DomainError("ALREADY_COMPLETE", "This task is already complete.", 409);
  await audit(orgId, actor, "exit.task_completed", task.checklist.resignationId, { taskId, description: task.description });
  return getChecklist(orgId, task.checklist.resignationId);
}

// FR-006 / FR-010 / SC-002 / SC-004: offboard only with clearance complete, unless forced; uses
// 002's offboarding, which revokes every session. Forced exits keep open tasks visible.
export async function completeOffboarding(orgId: string, id: string, force: boolean, actor: AccessTokenPayload) {
  const r = await requireResignation(orgId, id);
  if (r.status !== "SERVING_NOTICE") {
    throw new DomainError("INVALID_STATE", "Only a resignation serving notice can be completed.", 409);
  }
  const checklist = await repo.findChecklistByResignation(orgId, id);
  const remaining = (checklist?.tasks ?? []).filter((t) => t.status === "INCOMPLETE");
  if (remaining.length > 0 && !force) {
    throw new DomainError(
      "EXIT_CLEARANCE_INCOMPLETE",
      `Exit clearance is incomplete: ${remaining.length} task(s) remain.`,
      409,
      { remainingTasks: remaining.map((t) => `${t.ownerRole}: ${t.description}`) },
    );
  }

  await offboardEmployee(orgId, r.employeeId, actor);
  await repo.transition(id, ["SERVING_NOTICE"], { status: "COMPLETED", completedAt: new Date(), forcedOffboard: remaining.length > 0 });
  await audit(orgId, actor, "resignation.completed", id, { forced: remaining.length > 0, openTasks: remaining.length });
  return present((await repo.findResignation(orgId, id))!, actor);
}

// --- Prompts & decorations ---

// US2.3: once a serving-notice employee's last day has passed, prompt HR (once).
export async function promptExitsDue(now: Date = new Date()) {
  const due = await repo.findExitsDue(moment.utc(now).startOf("day").toDate());
  for (const r of due) {
    const employee = await getEmployeeSummary(r.orgId, r.employeeId);
    await notifyRoles(r.orgId, ["HR"], {
      type: "EXIT_DUE",
      message: `${employee?.name ?? "An employee"}'s last working day (${day(r.confirmedLastDay)}) has passed — exit clearance and offboarding are due.`,
      link: `/exit/resignations/${r.id}`,
    });
    await repo.updateResignation(r.id, { exitDuePromptedAt: now });
  }
  return due.length;
}

// FR-004 / SC-005: employee responses carry exitStatus while a resignation is active; a
// withdrawn one leaves nothing behind.
export async function exitStatusFor(orgId: string, employeeIds: string[]) {
  const active = await repo.activeResignationsFor(orgId, employeeIds);
  const byEmployee = new Map(active.map((r) => [r.employeeId, r]));
  return new Map(
    employeeIds.map((id) => {
      const r = byEmployee.get(id);
      return [
        id,
        r
          ? { exitStatus: r.status === "SERVING_NOTICE" ? "SERVING_NOTICE" : "RESIGNATION_PENDING", lastWorkingDay: day(r.confirmedLastDay ?? r.proposedLastDay) }
          : { exitStatus: null, lastWorkingDay: null },
      ];
    }),
  );
}

// 014 FR-006: complete a tagged task on the employee's active exit checklist, if any.
export async function completeSystemTask(orgId: string, employeeId: string, systemKey: string, actor: AccessTokenPayload) {
  const active = await repo.findActiveResignation(orgId, employeeId);
  if (!active || active.status !== "SERVING_NOTICE" || !actor.employeeId) return false;
  const checklist = await repo.findChecklistByResignation(orgId, active.id);
  const task = checklist?.tasks.find((t) => t.systemKey === systemKey && t.status === "INCOMPLETE");
  if (!checklist || checklist.closedAt || !task) return false;
  const { count } = await repo.completeTask(task.id, actor.employeeId);
  if (count > 0) await audit(orgId, actor, "exit.task_completed", active.id, { taskId: task.id, systemKey });
  return count > 0;
}
