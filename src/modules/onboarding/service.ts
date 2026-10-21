// Business rules for the onboarding module. Framework-agnostic — no req/res.
// Implements specs/007-employee-onboarding/spec.md.
import moment from "moment";
import { DomainError } from "../../middleware/errorHandler.js";
import { getEmployeeSummary } from "../employee/service.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import type {
  AddTaskRequest,
  CreateTemplateTaskRequest,
  OnboardingOwnerRole,
  UpdateTaskRequest,
  UpdateTemplateTaskRequest,
} from "./schema.js";

// research.md R1: the standard template an org starts with (FR-010 makes it editable).
export const DEFAULT_TEMPLATE: Array<{ description: string; ownerRole: OnboardingOwnerRole }> = [
  { description: "Submit ID proof and bank details", ownerRole: "EMPLOYEE" },
  { description: "Assign laptop and accounts", ownerRole: "IT" },
  { description: "Team introduction and desk setup", ownerRole: "MANAGER" },
  { description: "Complete company induction", ownerRole: "HR" },
  { description: "Read and acknowledge company policies", ownerRole: "EMPLOYEE" },
];

type Task = {
  id: string;
  status: string;
  ownerRole: OnboardingOwnerRole;
  ownerEmployeeId: string | null;
};
type Hire = NonNullable<Awaited<ReturnType<typeof getEmployeeSummary>>>;

function isPrivileged(actor: AccessTokenPayload) {
  return actor.role === "HR" || actor.role === "ADMIN";
}

async function audit(orgId: string, actor: AccessTokenPayload, action: string, entityId: string, after?: unknown, before?: unknown) {
  if (!actor.employeeId) return;
  await repo.writeActivityLog({ orgId, actorId: actor.employeeId, action, entity: "OnboardingTask", entityId, before, after });
}

async function requireHire(orgId: string, employeeId: string): Promise<Hire> {
  const hire = await getEmployeeSummary(orgId, employeeId);
  if (!hire) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  return hire;
}

// FR-003/FR-004/FR-006 — who may complete a task. HR/Admin always (Admin also covers the IT
// owner role, which has no login role of its own). An explicit reassignment wins over the role.
export function canCompleteTask(task: Task, hire: Hire, actor: AccessTokenPayload): boolean {
  if (isPrivileged(actor)) return true;
  if (!actor.employeeId) return false;
  if (task.ownerEmployeeId) return task.ownerEmployeeId === actor.employeeId;
  switch (task.ownerRole) {
    case "EMPLOYEE":
      return hire.id === actor.employeeId;
    case "MANAGER":
      return hire.managerId === actor.employeeId;
    default:
      return false;
  }
}

function summarize<T extends { status: string }>(tasks: T[]) {
  const completedCount = tasks.filter((t) => t.status === "COMPLETE").length;
  return {
    completedCount,
    totalCount: tasks.length,
    status: completedCount === tasks.length ? ("COMPLETE" as const) : ("IN_PROGRESS" as const),
  };
}

// --- Template (FR-010) ---

export async function ensureTemplate(orgId: string) {
  const existing = await repo.listTemplates(orgId);
  if (existing.length > 0) return existing;
  await repo.createTemplates(DEFAULT_TEMPLATE.map((t, order) => ({ orgId, ...t, order })));
  return repo.listTemplates(orgId);
}

export async function listTemplate(orgId: string) {
  return ensureTemplate(orgId);
}

export async function addTemplateTask(orgId: string, input: CreateTemplateTaskRequest) {
  const current = await ensureTemplate(orgId);
  return repo.createTemplate({
    orgId,
    description: input.description,
    ownerRole: input.ownerRole ?? "HR",
    order: input.order ?? (current.at(-1)?.order ?? -1) + 1,
  });
}

export async function updateTemplateTask(orgId: string, id: string, input: UpdateTemplateTaskRequest) {
  const existing = await repo.findTemplate(orgId, id);
  if (!existing) throw new DomainError("NOT_FOUND", "Template task not found.", 404);
  return repo.updateTemplate(id, input);
}

export async function removeTemplateTask(orgId: string, id: string) {
  const existing = await repo.findTemplate(orgId, id);
  if (!existing) throw new DomainError("NOT_FOUND", "Template task not found.", 404);
  await repo.deleteTemplate(id);
}

// --- Checklists (US1) ---

// FR-001 (auto, from the employee-created hook) and FR-005 (manual attach). Tasks are copied
// from the template, so later template edits never change an existing checklist.
export async function attachChecklist(orgId: string, employeeId: string, actor: AccessTokenPayload) {
  await requireHire(orgId, employeeId);
  if (await repo.findChecklistByEmployee(orgId, employeeId)) {
    throw new DomainError("CHECKLIST_EXISTS", "This employee already has an onboarding checklist.", 409);
  }
  const template = await ensureTemplate(orgId);
  const checklist = await repo.createChecklistWithTasks(
    orgId,
    employeeId,
    template.map((t, position) => ({ description: t.description, ownerRole: t.ownerRole, position })),
  );
  if (actor.employeeId) {
    await repo.writeActivityLog({
      orgId,
      actorId: actor.employeeId,
      action: "onboarding.checklist_created",
      entity: "OnboardingChecklist",
      entityId: checklist.id,
      after: { employeeId, taskCount: checklist.tasks.length },
    });
  }
  return { ...checklist, ...summarize(checklist.tasks) };
}

// Registered with employee/service.onEmployeeCreated() in app.ts.
export async function onEmployeeCreated(orgId: string, employeeId: string, actor: AccessTokenPayload) {
  if (await repo.findChecklistByEmployee(orgId, employeeId)) return;
  await attachChecklist(orgId, employeeId, actor);
}

// SC-002: HR/Admin, the hire, their manager, or anyone a task is reassigned to.
export async function getChecklist(orgId: string, employeeId: string, actor: AccessTokenPayload) {
  const hire = await requireHire(orgId, employeeId);
  const checklist = await repo.findChecklistByEmployee(orgId, employeeId);
  if (!checklist) throw new DomainError("NOT_FOUND", "This employee has no onboarding checklist.", 404);

  const allowed =
    isPrivileged(actor) ||
    actor.employeeId === hire.id ||
    actor.employeeId === hire.managerId ||
    checklist.tasks.some((t) => t.ownerEmployeeId && t.ownerEmployeeId === actor.employeeId);
  if (!allowed) {
    throw new DomainError("FORBIDDEN", "You don't have access to this onboarding checklist.", 403);
  }
  return {
    ...checklist,
    ...summarize(checklist.tasks),
    tasks: checklist.tasks.map((t) => ({ ...t, canComplete: canCompleteTask(t, hire, actor) })),
  };
}

// --- Tasks (FR-002, FR-004, FR-006) ---

async function requireActiveEmployee(orgId: string, employeeId: string) {
  const e = await getEmployeeSummary(orgId, employeeId);
  if (!e || e.status !== "ACTIVE") {
    throw new DomainError("OWNER_INVALID", "The selected owner is not an active employee.", 409);
  }
}

export async function addTask(orgId: string, employeeId: string, input: AddTaskRequest, actor: AccessTokenPayload) {
  const checklist = await repo.findChecklistByEmployee(orgId, employeeId);
  if (!checklist) throw new DomainError("NOT_FOUND", "This employee has no onboarding checklist.", 404);
  if (input.ownerEmployeeId) await requireActiveEmployee(orgId, input.ownerEmployeeId);
  const task = await repo.createTask({
    orgId,
    checklistId: checklist.id,
    description: input.description,
    ownerRole: input.ownerRole ?? "HR",
    ownerEmployeeId: input.ownerEmployeeId ?? null,
    position: (await repo.maxTaskPosition(checklist.id)) + 1,
  });
  await audit(orgId, actor, "onboarding.task_added", task.id, { description: task.description, ownerRole: task.ownerRole });
  return task;
}

export async function updateTask(orgId: string, taskId: string, input: UpdateTaskRequest, actor: AccessTokenPayload) {
  const task = await repo.findTask(orgId, taskId);
  if (!task) throw new DomainError("NOT_FOUND", "Onboarding task not found.", 404);
  if (input.ownerEmployeeId) await requireActiveEmployee(orgId, input.ownerEmployeeId);
  const updated = await repo.updateTask(taskId, input);
  await audit(
    orgId,
    actor,
    "onboarding.task_updated",
    taskId,
    { ownerRole: updated.ownerRole, ownerEmployeeId: updated.ownerEmployeeId, description: updated.description },
    { ownerRole: task.ownerRole, ownerEmployeeId: task.ownerEmployeeId, description: task.description },
  );
  return updated;
}

export async function removeTask(orgId: string, taskId: string, actor: AccessTokenPayload) {
  const task = await repo.findTask(orgId, taskId);
  if (!task) throw new DomainError("NOT_FOUND", "Onboarding task not found.", 404);
  await repo.deleteTask(taskId);
  await audit(orgId, actor, "onboarding.task_removed", taskId, undefined, { description: task.description });
}

export async function completeTask(orgId: string, taskId: string, actor: AccessTokenPayload) {
  const task = await repo.findTask(orgId, taskId);
  if (!task) throw new DomainError("NOT_FOUND", "Onboarding task not found.", 404);
  const hire = await requireHire(orgId, task.checklist.employeeId);
  if (!canCompleteTask(task, hire, actor)) {
    throw new DomainError("FORBIDDEN", "Only this task's owner (or HR/Admin) can complete it.", 403);
  }
  if (!actor.employeeId) {
    throw new DomainError("FORBIDDEN", "Your account has no employee record to attribute this to.", 403);
  }
  const { count } = await repo.completeTask(taskId, actor.employeeId);
  if (count === 0) throw new DomainError("ALREADY_COMPLETE", "This task is already complete.", 409);
  await audit(orgId, actor, "onboarding.task_completed", taskId, { completedById: actor.employeeId });
  return repo.findTask(orgId, taskId);
}

// Incomplete tasks the caller can act on, across every checklist ("my onboarding to-dos").
export async function listMyTasks(orgId: string, actor: AccessTokenPayload) {
  const tasks = await repo.listIncompleteTasks(orgId);
  const hires = new Map<string, Hire | null>();
  const mine = [];
  for (const task of tasks) {
    const id = task.checklist.employeeId;
    if (!hires.has(id)) hires.set(id, await getEmployeeSummary(orgId, id));
    const hire = hires.get(id);
    if (!hire) continue;
    // HR/Admin see only tasks routed to them, not every task they could override.
    const routedToMe = isPrivileged(actor)
      ? task.ownerEmployeeId
        ? task.ownerEmployeeId === actor.employeeId
        : (task.ownerRole === "HR" && actor.role === "HR") || (task.ownerRole === "IT" && actor.role === "ADMIN")
      : canCompleteTask(task, hire, actor);
    if (routedToMe) mine.push({ ...task, employee: { id: hire.id, name: hire.name } });
  }
  return mine;
}

// --- Overview (US3) ---

// FR-008/FR-009/SC-004: only in-progress checklists of active employees; stalled = still
// incomplete after the joining date.
export async function getOverview(orgId: string, now: Date = new Date()) {
  const checklists = await repo.listChecklistsWithTasks(orgId);
  const today = moment.utc(now).startOf("day");
  const entries = [];
  for (const c of checklists) {
    const s = summarize(c.tasks);
    if (s.status === "COMPLETE") continue;
    const hire = await getEmployeeSummary(orgId, c.employeeId);
    if (!hire || hire.status !== "ACTIVE") continue;
    const joined = moment.utc(hire.dateOfJoining).startOf("day");
    entries.push({
      checklistId: c.id,
      employeeId: hire.id,
      name: hire.name,
      dateOfJoining: hire.dateOfJoining,
      daysSinceJoining: today.diff(joined, "days"),
      completedCount: s.completedCount,
      totalCount: s.totalCount,
      stalled: today.isAfter(joined),
    });
  }
  return entries.sort((a, b) => Number(b.stalled) - Number(a.stalled) || b.daysSinceJoining - a.daysSinceJoining);
}

// Registered with employee/service.setOnboardingStatusProvider() in app.ts (FR-007).
export async function statusesFor(orgId: string, employeeIds: string[]) {
  const checklists = await repo.listChecklistsWithTasks(orgId, employeeIds);
  return new Map(checklists.map((c) => [c.employeeId, summarize(c.tasks).status as string]));
}
