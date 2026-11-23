// Business rules for the time tracker. Framework-agnostic — no req/res.
// Implements specs/028-time-tracker/spec.md (decisions in research.md).
import { Prisma, type TimesheetStatus } from "@prisma/client";
import { DomainError } from "../../middleware/errorHandler.js";
import { getEmployeeSummary, listDirectReportIds, listActiveEmployeeSummaries, listEmployeesForAnalytics } from "../employee/service.js";
import { notifyEmployees, notifyRoles } from "../notifications/service.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as repo from "./repository.js";
import {
  addDays,
  daysBetween,
  elapsedMinutes,
  fromDbDate,
  isFlaggedTimer,
  localDate,
  toDbDate,
  weekDays,
  weekStartOf,
} from "./week.js";

export const LOCKED_STATUSES: readonly TimesheetStatus[] = ["SUBMITTED", "APPROVED"];
const MAX_DAY_MINUTES = 1440;
const MAX_RANGE_DAYS = 366;

const isHr = (actor: AccessTokenPayload) => actor.role === "HR" || actor.role === "ADMIN";

function requireEmployee(actor: AccessTokenPayload): string {
  if (!actor.employeeId) throw new DomainError("NO_EMPLOYEE_RECORD", "Your account isn't linked to an employee record.", 403);
  return actor.employeeId;
}

async function requireActiveSelf(orgId: string, actor: AccessTokenPayload) {
  const employeeId = requireEmployee(actor);
  const me = await getEmployeeSummary(orgId, employeeId);
  if (!me || me.status !== "ACTIVE") throw new DomainError("EMPLOYEE_INACTIVE", "Only active employees can log time.", 403);
  return me;
}

async function nameMap(orgId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const all = await listEmployeesForAnalytics(orgId);
  const wanted = new Set(ids);
  return new Map(all.filter((e) => wanted.has(e.id)).map((e) => [e.id, e.name]));
}

// FR-019: who the actor may see. `null` = everyone in the org.
async function visibleEmployeeIds(orgId: string, actor: AccessTokenPayload): Promise<string[] | null> {
  if (isHr(actor)) return null;
  const self = requireEmployee(actor);
  if (actor.role === "MANAGER") return [self, ...(await listDirectReportIds(orgId, self))];
  return [self];
}

async function assertCanView(orgId: string, actor: AccessTokenPayload, employeeId: string) {
  const visible = await visibleEmployeeIds(orgId, actor);
  if (visible && !visible.includes(employeeId)) {
    throw new DomainError("FORBIDDEN", "You can't view this employee's time.", 403);
  }
}

// --- Projects (US2) ---

type ProjectRow = NonNullable<Awaited<ReturnType<typeof repo.findProject>>>;

function canManageProject(project: { ownerId: string }, actor: AccessTokenPayload) {
  return isHr(actor) || (actor.role === "MANAGER" && actor.employeeId === project.ownerId);
}

function presentProject(p: ProjectRow, actor: AccessTokenPayload) {
  const { _count, orgId: _o, updatedAt: _u, ...rest } = p;
  return { ...rest, createdAt: p.createdAt.toISOString(), canManage: canManageProject(p, actor), memberCount: _count.members };
}

async function presentProjectDetail(orgId: string, id: string, actor: AccessTokenPayload) {
  const p = await repo.findProjectDetail(orgId, id);
  if (!p) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  const names = await nameMap(orgId, p.members.map((m) => m.employeeId));
  const { tasks, members, ...project } = p;
  return {
    ...presentProject(project as ProjectRow, actor),
    tasks: tasks.map((t) => ({ id: t.id, projectId: t.projectId, name: t.name, status: t.status })),
    members: members.map((m) => ({ employeeId: m.employeeId, name: names.get(m.employeeId) ?? "Unknown" })),
  };
}

async function requireManageableProject(orgId: string, id: string, actor: AccessTokenPayload) {
  const project = await repo.findProject(orgId, id);
  if (!project) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  if (!canManageProject(project, actor)) throw new DomainError("FORBIDDEN", "Only the project owner or HR can change this project.", 403);
  return project;
}

export async function createProject(
  orgId: string,
  input: { name: string; code: string; clientName?: string; billable?: boolean },
  actor: AccessTokenPayload,
) {
  const ownerId = requireEmployee(actor);
  try {
    const p = await repo.createProject({
      orgId,
      name: input.name,
      code: input.code,
      clientName: input.clientName || null,
      billable: input.billable ?? false,
      ownerId,
    });
    return presentProjectDetail(orgId, p.id, actor);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DomainError("PROJECT_CODE_TAKEN", "Another project already uses this code.", 409);
    }
    throw err;
  }
}

export async function listProjects(orgId: string, actor: AccessTokenPayload, opts: { status?: string; mine?: boolean }) {
  const statusFilter = opts.status === "ALL" ? {} : { status: (opts.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE") as "ACTIVE" | "ARCHIVED" };
  let where: Prisma.TimeProjectWhereInput = statusFilter;
  if (opts.mine || !isHr(actor)) {
    const self = requireEmployee(actor);
    const memberOf = await repo.memberProjectIds(orgId, [self]);
    if (opts.mine) {
      where = { ...statusFilter, id: { in: memberOf } };
    } else if (actor.role === "MANAGER") {
      where = { ...statusFilter, OR: [{ ownerId: self }, { id: { in: memberOf } }] };
    } else {
      where = { ...statusFilter, id: { in: memberOf } };
    }
  }
  const projects = await repo.listProjects(orgId, where);
  return projects.map((p) => presentProject(p, actor));
}

export async function getProject(orgId: string, id: string, actor: AccessTokenPayload) {
  const project = await repo.findProject(orgId, id);
  if (!project) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  if (!isHr(actor) && !canManageProject(project, actor)) {
    const visible = (await visibleEmployeeIds(orgId, actor)) ?? [];
    const memberOf = await repo.memberProjectIds(orgId, visible);
    if (!memberOf.includes(id)) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  }
  return presentProjectDetail(orgId, id, actor);
}

export async function updateProject(
  orgId: string,
  id: string,
  input: { name?: string; clientName?: string | null; billable?: boolean; status?: "ACTIVE" | "ARCHIVED" },
  actor: AccessTokenPayload,
) {
  await requireManageableProject(orgId, id, actor);
  await repo.updateProject(id, { ...input, ...(input.clientName !== undefined ? { clientName: input.clientName || null } : {}) });
  return presentProjectDetail(orgId, id, actor);
}

export async function createTask(orgId: string, projectId: string, name: string, actor: AccessTokenPayload) {
  await requireManageableProject(orgId, projectId, actor);
  try {
    const t = await repo.createTask({ orgId, projectId, name });
    return { id: t.id, projectId: t.projectId, name: t.name, status: t.status };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DomainError("TASK_EXISTS", "This project already has a task with that name.", 409);
    }
    throw err;
  }
}

export async function updateTask(orgId: string, taskId: string, input: { name?: string; status?: "ACTIVE" | "ARCHIVED" }, actor: AccessTokenPayload) {
  const task = await repo.findTask(orgId, taskId);
  if (!task) throw new DomainError("NOT_FOUND", "Task not found.", 404);
  await requireManageableProject(orgId, task.projectId, actor);
  try {
    const t = await repo.updateTask(taskId, input);
    return { id: t.id, projectId: t.projectId, name: t.name, status: t.status };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DomainError("TASK_EXISTS", "This project already has a task with that name.", 409);
    }
    throw err;
  }
}

export async function addMembers(orgId: string, projectId: string, employeeIds: string[], actor: AccessTokenPayload) {
  await requireManageableProject(orgId, projectId, actor);
  const active = new Set((await listActiveEmployeeSummaries(orgId)).map((e) => e.id));
  const invalid = employeeIds.filter((id) => !active.has(id));
  if (invalid.length > 0) throw new DomainError("EMPLOYEE_INACTIVE", "Only active employees can be added to a project.", 400);
  await repo.addMembers(orgId, projectId, [...new Set(employeeIds)]);
  return presentProjectDetail(orgId, projectId, actor);
}

export async function removeMember(orgId: string, projectId: string, employeeId: string, actor: AccessTokenPayload) {
  await requireManageableProject(orgId, projectId, actor);
  await repo.removeMember(projectId, employeeId);
  return presentProjectDetail(orgId, projectId, actor);
}

// --- Entries (US1) ---

type EntryRow = NonNullable<Awaited<ReturnType<typeof repo.findEntry>>>;

function presentEntry(e: EntryRow, locked: boolean) {
  return {
    id: e.id,
    employeeId: e.employeeId,
    projectId: e.projectId,
    projectName: e.project.name,
    projectCode: e.project.code,
    taskId: e.taskId,
    taskName: e.task.name,
    date: fromDbDate(e.date),
    minutes: e.minutes,
    note: e.note,
    billable: e.billable,
    source: e.source,
    flagged: e.flagged,
    locked,
  };
}

// FR-004/FR-003: a task the employee may log to right now.
async function requireLoggableTask(orgId: string, taskId: string, employeeId: string) {
  const task = await repo.findTask(orgId, taskId);
  if (!task) throw new DomainError("NOT_FOUND", "Task not found.", 404);
  if (!(await repo.isMember(task.projectId, employeeId))) {
    throw new DomainError("NOT_A_MEMBER", "You're not a member of this project.", 403);
  }
  if (task.status !== "ACTIVE" || task.project.status !== "ACTIVE") {
    throw new DomainError("PROJECT_ARCHIVED", "This project or task is archived; no new time can be logged.", 409);
  }
  return task;
}

// R6 / FR-013.
async function assertWeekOpen(orgId: string, employeeId: string, date: string, tx?: repo.Tx) {
  const sheet = await repo.findTimesheet(orgId, employeeId, toDbDate(weekStartOf(date)), tx);
  if (sheet && LOCKED_STATUSES.includes(sheet.status)) {
    throw new DomainError("WEEK_LOCKED", "This week's timesheet is submitted or approved, so it can't be changed.", 409);
  }
}

// FR-006.
async function assertDailyLimit(orgId: string, employeeId: string, date: string, minutes: number, excludeId?: string, tx?: repo.Tx) {
  const already = await repo.sumMinutesOnDate(orgId, employeeId, toDbDate(date), excludeId, tx);
  if (already + minutes > MAX_DAY_MINUTES) {
    throw new DomainError("DAILY_LIMIT_EXCEEDED", "That would put you over 24 hours on this day.", 409);
  }
}

async function lockedWeeks(orgId: string, employeeId: string, weekStarts: string[]) {
  const locked = new Set<string>();
  for (const ws of new Set(weekStarts)) {
    const sheet = await repo.findTimesheet(orgId, employeeId, toDbDate(ws));
    if (sheet && LOCKED_STATUSES.includes(sheet.status)) locked.add(ws);
  }
  return locked;
}

export async function createEntry(
  orgId: string,
  input: { taskId: string; date: string; minutes: number; note?: string; billable?: boolean },
  actor: AccessTokenPayload,
) {
  const me = await requireActiveSelf(orgId, actor);
  const task = await requireLoggableTask(orgId, input.taskId, me.id);
  await assertWeekOpen(orgId, me.id, input.date);
  await assertDailyLimit(orgId, me.id, input.date, input.minutes);
  const weekStart = weekStartOf(input.date);
  const entry = await repo.createEntry({
    orgId,
    employeeId: me.id,
    projectId: task.projectId,
    taskId: task.id,
    date: toDbDate(input.date),
    weekStart: toDbDate(weekStart),
    minutes: input.minutes,
    note: input.note || null,
    billable: input.billable ?? task.project.billable,
  });
  await repo.upsertTimesheet(orgId, me.id, toDbDate(weekStart));
  return presentEntry(entry, false);
}

export async function updateEntry(
  orgId: string,
  id: string,
  input: { taskId?: string; date?: string; minutes?: number; note?: string | null; billable?: boolean },
  actor: AccessTokenPayload,
) {
  const me = await requireActiveSelf(orgId, actor);
  const entry = await repo.findEntry(orgId, id);
  if (!entry || entry.employeeId !== me.id) throw new DomainError("NOT_FOUND", "Time entry not found.", 404);
  const oldDate = fromDbDate(entry.date);
  const newDate = input.date ?? oldDate;
  await assertWeekOpen(orgId, me.id, oldDate);
  if (newDate !== oldDate) await assertWeekOpen(orgId, me.id, newDate);
  let projectId = entry.projectId;
  if (input.taskId && input.taskId !== entry.taskId) projectId = (await requireLoggableTask(orgId, input.taskId, me.id)).projectId;
  await assertDailyLimit(orgId, me.id, newDate, input.minutes ?? entry.minutes, entry.id);
  const updated = await repo.updateEntry(id, {
    ...(input.taskId ? { taskId: input.taskId, projectId } : {}),
    ...(input.date ? { date: toDbDate(newDate), weekStart: toDbDate(weekStartOf(newDate)) } : {}),
    ...(input.minutes !== undefined ? { minutes: input.minutes } : {}),
    ...(input.note !== undefined ? { note: input.note || null } : {}),
    ...(input.billable !== undefined ? { billable: input.billable } : {}),
  });
  if (newDate !== oldDate) await repo.upsertTimesheet(orgId, me.id, toDbDate(weekStartOf(newDate)));
  return presentEntry(updated, false);
}

export async function deleteEntry(orgId: string, id: string, actor: AccessTokenPayload) {
  const me = requireEmployee(actor);
  const entry = await repo.findEntry(orgId, id);
  if (!entry || entry.employeeId !== me) throw new DomainError("NOT_FOUND", "Time entry not found.", 404);
  await assertWeekOpen(orgId, me, fromDbDate(entry.date));
  await repo.deleteEntry(id);
}

export async function listEntries(orgId: string, actor: AccessTokenPayload, q: { from?: string; to?: string; employeeId?: string }) {
  const employeeId = q.employeeId ?? requireEmployee(actor);
  await assertCanView(orgId, actor, employeeId);
  const today = localDate(new Date());
  const from = q.from ?? weekStartOf(today);
  const to = q.to ?? addDays(from, 6);
  if (daysBetween(from, to) < 0 || daysBetween(from, to) > MAX_RANGE_DAYS) {
    throw new DomainError("INVALID_RANGE", `The date range must be 0–${MAX_RANGE_DAYS} days.`, 400);
  }
  const entries = await repo.listEntries(orgId, { employeeId, date: { gte: toDbDate(from), lte: toDbDate(to) } });
  const locked = await lockedWeeks(orgId, employeeId, entries.map((e) => fromDbDate(e.weekStart)));
  return entries.map((e) => presentEntry(e, locked.has(fromDbDate(e.weekStart))));
}

// --- Timer (US3) ---

type TimerRow = NonNullable<Awaited<ReturnType<typeof repo.findTimer>>>;

function presentTimer(t: TimerRow, now = new Date()) {
  return {
    id: t.id,
    taskId: t.taskId,
    taskName: t.task.name,
    projectId: t.projectId,
    projectName: t.task.project.name,
    startedAt: t.startedAt.toISOString(),
    note: t.note,
    elapsedSeconds: Math.max(0, Math.floor((now.getTime() - t.startedAt.getTime()) / 1000)),
  };
}

export async function getTimer(orgId: string, actor: AccessTokenPayload) {
  const timer = await repo.findTimer(orgId, requireEmployee(actor));
  return { timer: timer ? presentTimer(timer) : null };
}

// FR-009/FR-011: turn a running timer into an entry, inside the caller's transaction.
async function stopInto(tx: repo.Tx, orgId: string, timer: TimerRow, stoppedAt: Date, note?: string) {
  const date = localDate(timer.startedAt);
  const minutes = Math.min(elapsedMinutes(timer.startedAt, stoppedAt), MAX_DAY_MINUTES);
  const project = await tx.timeProject.findUnique({ where: { id: timer.projectId }, select: { billable: true } });
  await assertDailyLimit(orgId, timer.employeeId, date, minutes, undefined, tx);
  const entry = await repo.createEntry(
    {
      orgId,
      employeeId: timer.employeeId,
      projectId: timer.projectId,
      taskId: timer.taskId,
      date: toDbDate(date),
      weekStart: toDbDate(weekStartOf(date)),
      minutes,
      note: (note ?? timer.note) || null,
      billable: project?.billable ?? false,
      source: "TIMER",
      flagged: isFlaggedTimer(timer.startedAt, stoppedAt),
    },
    tx,
  );
  await repo.deleteTimer(timer.id, tx);
  await repo.upsertTimesheet(orgId, timer.employeeId, toDbDate(weekStartOf(date)), tx);
  return entry;
}

export async function startTimer(orgId: string, input: { taskId: string; note?: string; switch?: boolean }, actor: AccessTokenPayload) {
  const me = await requireActiveSelf(orgId, actor);
  const task = await requireLoggableTask(orgId, input.taskId, me.id);
  const now = new Date();
  await assertWeekOpen(orgId, me.id, localDate(now));
  try {
    return await repo.transaction(async (tx) => {
      const running = await repo.findTimer(orgId, me.id, tx);
      let stopped: EntryRow | null = null;
      if (running) {
        if (!input.switch) throw new DomainError("TIMER_ALREADY_RUNNING", "You already have a timer running. Stop it or switch tasks.", 409);
        stopped = await stopInto(tx, orgId, running, now);
      }
      const timer = await repo.createTimer(
        { orgId, employeeId: me.id, taskId: task.id, projectId: task.projectId, startedAt: now, note: input.note || null },
        tx,
      );
      return { timer: presentTimer(timer, now), stoppedEntry: stopped ? presentEntry(stopped, false) : null };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DomainError("TIMER_ALREADY_RUNNING", "You already have a timer running. Stop it or switch tasks.", 409);
    }
    throw err;
  }
}

export async function stopTimer(orgId: string, input: { note?: string }, actor: AccessTokenPayload) {
  const employeeId = requireEmployee(actor);
  const entry = await repo.transaction(async (tx) => {
    const timer = await repo.findTimer(orgId, employeeId, tx);
    if (!timer) throw new DomainError("NO_TIMER", "You don't have a timer running.", 404);
    return stopInto(tx, orgId, timer, new Date(), input.note);
  });
  return { entry: presentEntry(entry, false) };
}

export async function updateTimerNote(orgId: string, note: string, actor: AccessTokenPayload) {
  const timer = await repo.findTimer(orgId, requireEmployee(actor));
  if (!timer) throw new DomainError("NO_TIMER", "You don't have a timer running.", 404);
  return { timer: presentTimer(await repo.updateTimer(timer.id, { note: note || null })) };
}

// 030: read-only description of a task for another module's confirmation preview (the AI
// assistant). Applies no RBAC beyond reporting membership — callers must not expose it raw.
export async function describeTask(orgId: string, taskId: string, employeeId: string) {
  const task = await repo.findTask(orgId, taskId);
  if (!task) return null;
  return {
    taskId: task.id,
    taskName: task.name,
    projectId: task.projectId,
    projectName: task.project.name,
    projectCode: task.project.code,
    billable: task.project.billable,
    active: task.status === "ACTIVE" && task.project.status === "ACTIVE",
    isMember: await repo.isMember(task.projectId, employeeId),
  };
}

// 029 FR-010: remove idle minutes from the running timer by moving its start later (never past now).
export async function trimTimer(orgId: string, minutes: number, actor: AccessTokenPayload) {
  const timer = await repo.findTimer(orgId, requireEmployee(actor));
  if (!timer) throw new DomainError("NO_TIMER", "You don't have a timer running.", 404);
  const now = new Date();
  const startedAt = new Date(Math.min(timer.startedAt.getTime() + minutes * 60_000, now.getTime()));
  return { timer: presentTimer(await repo.updateTimer(timer.id, { startedAt }), now) };
}

export async function discardTimer(orgId: string, actor: AccessTokenPayload) {
  const timer = await repo.findTimer(orgId, requireEmployee(actor));
  if (!timer) throw new DomainError("NO_TIMER", "You don't have a timer running.", 404);
  await repo.deleteTimer(timer.id);
}

// --- Timesheets (US4) ---

async function isApproverFor(orgId: string, actor: AccessTokenPayload, employeeId: string) {
  if (actor.employeeId === employeeId) return false; // R7: never your own
  if (isHr(actor)) return true;
  const employee = await getEmployeeSummary(orgId, employeeId);
  return Boolean(actor.employeeId && employee?.managerId === actor.employeeId);
}

export async function getWeek(orgId: string, actor: AccessTokenPayload, q: { weekStart?: string; employeeId?: string }) {
  const employeeId = q.employeeId ?? requireEmployee(actor);
  await assertCanView(orgId, actor, employeeId);
  const weekStart = weekStartOf(q.weekStart ?? localDate(new Date()));
  return buildWeek(orgId, actor, employeeId, weekStart);
}

async function buildWeek(orgId: string, actor: AccessTokenPayload, employeeId: string, weekStart: string) {
  const ws = toDbDate(weekStart);
  const [sheet, entries, employee, timer] = await Promise.all([
    repo.findTimesheet(orgId, employeeId, ws),
    repo.listEntries(orgId, { employeeId, weekStart: ws }),
    getEmployeeSummary(orgId, employeeId),
    repo.findTimer(orgId, employeeId),
  ]);
  const status = sheet?.status ?? "NOT_STARTED";
  const locked = LOCKED_STATUSES.includes(status as TimesheetStatus);
  const isSelf = actor.employeeId === employeeId;
  const approver = await isApproverFor(orgId, actor, employeeId);
  const decidedByName = sheet?.decidedById ? (await nameMap(orgId, [sheet.decidedById])).get(sheet.decidedById) ?? null : null;
  const timerInWeek = timer ? weekStartOf(localDate(timer.startedAt)) === weekStart : false;
  const days = weekDays(weekStart).map((date) => ({
    date,
    minutes: entries.filter((e) => fromDbDate(e.date) === date).reduce((s, e) => s + e.minutes, 0),
  }));
  return {
    employeeId,
    employeeName: employee?.name ?? "Unknown",
    weekStart,
    weekEnd: addDays(weekStart, 6),
    status,
    timesheetId: sheet?.id ?? null,
    totalMinutes: entries.reduce((s, e) => s + e.minutes, 0),
    billableMinutes: entries.filter((e) => e.billable).reduce((s, e) => s + e.minutes, 0),
    flaggedCount: entries.filter((e) => e.flagged).length,
    days,
    entries: entries.map((e) => presentEntry(e, locked)),
    submittedAt: sheet?.submittedAt?.toISOString() ?? null,
    decidedAt: sheet?.decidedAt?.toISOString() ?? null,
    decidedByName,
    reason: sheet?.reason ?? null,
    canEdit: isSelf && !locked,
    canSubmit: isSelf && !locked && entries.length > 0 && !timerInWeek,
    canDecide: approver && status === "SUBMITTED",
    canReopen: isHr(actor) && !isSelf && status === "APPROVED",
  };
}

function weekLink(weekStart: string, employeeId: string) {
  return `/time/timesheets?weekStart=${weekStart}&employeeId=${employeeId}`;
}

async function audit(orgId: string, actor: AccessTokenPayload, sheetId: string, verb: string, from: string, to: string, reason?: string) {
  if (!actor.employeeId) return;
  await repo.writeActivityLog({
    orgId,
    actorId: actor.employeeId,
    action: `timesheet.${verb}`,
    entity: "Timesheet",
    entityId: sheetId,
    before: { status: from },
    after: { status: to, ...(reason ? { reason } : {}) },
  });
}

export async function submitWeek(orgId: string, weekStartInput: string, actor: AccessTokenPayload) {
  const me = await requireActiveSelf(orgId, actor);
  const weekStart = weekStartOf(weekStartInput);
  const ws = toDbDate(weekStart);
  if ((await repo.countEntriesInWeek(orgId, me.id, ws)) === 0) {
    throw new DomainError("EMPTY_WEEK", "Log some time before submitting this week.", 409);
  }
  const timer = await repo.findTimer(orgId, me.id);
  if (timer && weekStartOf(localDate(timer.startedAt)) === weekStart) {
    throw new DomainError("TIMER_RUNNING", "Stop your running timer before submitting this week.", 409);
  }
  const sheet = await repo.upsertTimesheet(orgId, me.id, ws);
  const ok = await repo.transitionTimesheet(sheet.id, ["DRAFT", "REJECTED"], { status: "SUBMITTED", submittedAt: new Date(), reason: null });
  if (!ok) throw new DomainError("ALREADY_SUBMITTED", "This week is already submitted or approved.", 409);
  await audit(orgId, actor, sheet.id, "submitted", sheet.status, "SUBMITTED");

  const event = {
    type: "TIMESHEET_SUBMITTED" as const,
    message: `${me.name} submitted their timesheet for the week of ${weekStart}.`,
    link: weekLink(weekStart, me.id),
  };
  if (me.managerId) await notifyEmployees(orgId, [me.managerId], event);
  else await notifyRoles(orgId, ["HR", "ADMIN"], event);
  return buildWeek(orgId, actor, me.id, weekStart);
}

async function decide(
  orgId: string,
  id: string,
  actor: AccessTokenPayload,
  opts: { from: TimesheetStatus[]; to: TimesheetStatus; verb: string; reason?: string; hrOnly?: boolean },
) {
  const sheet = await repo.findTimesheetById(orgId, id);
  if (!sheet) throw new DomainError("NOT_FOUND", "Timesheet not found.", 404);
  const allowed = opts.hrOnly ? isHr(actor) && actor.employeeId !== sheet.employeeId : await isApproverFor(orgId, actor, sheet.employeeId);
  if (!allowed) throw new DomainError("NOT_APPROVER", "You can't decide this timesheet.", 403);
  const ok = await repo.transitionTimesheet(id, opts.from, {
    status: opts.to,
    decidedAt: new Date(),
    decidedById: actor.employeeId,
    reason: opts.reason ?? null,
  });
  if (!ok) throw new DomainError("INVALID_STATUS", `Only ${opts.from.join(" or ").toLowerCase()} timesheets can be ${opts.verb}.`, 409);
  await audit(orgId, actor, id, opts.verb, sheet.status, opts.to, opts.reason);

  const weekStart = fromDbDate(sheet.weekStart);
  const wording = { approved: "approved", rejected: "rejected", reopened: "reopened for changes" }[opts.verb] ?? opts.verb;
  await notifyEmployees(orgId, [sheet.employeeId], {
    type: "TIMESHEET_DECIDED",
    message: `Your timesheet for the week of ${weekStart} was ${wording}${opts.reason ? `: ${opts.reason}` : "."}`,
    link: weekLink(weekStart, sheet.employeeId),
  });
  return buildWeek(orgId, actor, sheet.employeeId, weekStart);
}

export const approveTimesheet = (orgId: string, id: string, actor: AccessTokenPayload) =>
  decide(orgId, id, actor, { from: ["SUBMITTED"], to: "APPROVED", verb: "approved" });
export const rejectTimesheet = (orgId: string, id: string, reason: string, actor: AccessTokenPayload) =>
  decide(orgId, id, actor, { from: ["SUBMITTED"], to: "REJECTED", verb: "rejected", reason });
export const reopenTimesheet = (orgId: string, id: string, reason: string, actor: AccessTokenPayload) =>
  decide(orgId, id, actor, { from: ["APPROVED"], to: "DRAFT", verb: "reopened", reason, hrOnly: true });

// --- Team week (US6) ---

export async function teamWeek(orgId: string, actor: AccessTokenPayload, q: { weekStart?: string; status?: string }) {
  const weekStart = weekStartOf(q.weekStart ?? localDate(new Date()));
  const ws = toDbDate(weekStart);
  const active = await listActiveEmployeeSummaries(orgId);
  const self = actor.employeeId;
  const people = isHr(actor)
    ? active.filter((e) => e.id !== self)
    : active.filter((e) => self && e.managerId === self);
  const ids = people.map((p) => p.id);
  const [sheets, totals] = await Promise.all([repo.listTimesheets(orgId, ids, ws), repo.weekTotals(orgId, ids, ws)]);
  const sheetBy = new Map(sheets.map((s) => [s.employeeId, s]));
  const rows = people.map((p) => {
    const mine = totals.filter((t) => t.employeeId === p.id);
    const sheet = sheetBy.get(p.id);
    return {
      employeeId: p.id,
      employeeName: p.name,
      weekStart,
      status: (sheet?.status ?? "NOT_STARTED") as string,
      timesheetId: sheet?.id ?? null,
      totalMinutes: mine.reduce((s, t) => s + (t._sum.minutes ?? 0), 0),
      flaggedCount: mine.filter((t) => t.flagged).reduce((s, t) => s + t._count._all, 0),
    };
  });
  return (q.status ? rows.filter((r) => r.status === q.status) : rows).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

// --- Reports (US5) ---

export async function hoursReport(
  orgId: string,
  actor: AccessTokenPayload,
  q: { from: string; to: string; groupBy: "project" | "employee" | "task"; projectId?: string; employeeId?: string; approvedOnly?: boolean },
) {
  const span = daysBetween(q.from, q.to);
  if (span < 0 || span > MAX_RANGE_DAYS) throw new DomainError("INVALID_RANGE", `The date range must be 0–${MAX_RANGE_DAYS} days.`, 400);
  const visible = await visibleEmployeeIds(orgId, actor);
  if (q.employeeId && visible && !visible.includes(q.employeeId)) {
    throw new DomainError("FORBIDDEN", "You can't view this employee's time.", 403);
  }
  const scope = q.employeeId ? [q.employeeId] : visible;
  const where: Prisma.TimeEntryWhereInput = {
    date: { gte: toDbDate(q.from), lte: toDbDate(q.to) },
    ...(scope ? { employeeId: { in: scope } } : {}),
    ...(q.projectId ? { projectId: q.projectId } : {}),
  };
  if (q.approvedOnly) {
    const weeks = await repo.approvedWeeks(orgId, scope ?? undefined, toDbDate(weekStartOf(q.from)), toDbDate(q.to));
    where.OR = weeks.length ? weeks.map((w) => ({ employeeId: w.employeeId, weekStart: w.weekStart })) : [{ id: "__none__" }];
  }
  const field = ({ project: "projectId", employee: "employeeId", task: "taskId" } as const)[q.groupBy];
  const groups = await repo.groupEntries(orgId, field, where);

  const acc = new Map<string, { billable: number; nonBillable: number }>();
  for (const g of groups) {
    const key = (g as Record<string, unknown>)[field] as string;
    const row = acc.get(key) ?? { billable: 0, nonBillable: 0 };
    if (g.billable) row.billable += g._sum.minutes ?? 0;
    else row.nonBillable += g._sum.minutes ?? 0;
    acc.set(key, row);
  }
  const keys = [...acc.keys()];
  let labels = new Map<string, string>();
  if (q.groupBy === "employee") labels = await nameMap(orgId, keys);
  else if (q.groupBy === "project") labels = new Map((await repo.listProjectsByIds(orgId, keys)).map((p) => [p.id, `${p.code} · ${p.name}`]));
  else labels = new Map((await repo.listTasksByIds(orgId, keys)).map((t) => [t.id, t.name]));

  const rows = keys
    .map((key) => {
      const r = acc.get(key)!;
      return {
        key,
        label: labels.get(key) ?? "Unknown",
        totalMinutes: r.billable + r.nonBillable,
        billableMinutes: r.billable,
        nonBillableMinutes: r.nonBillable,
      };
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
  const totals = rows.reduce(
    (t, r) => ({
      totalMinutes: t.totalMinutes + r.totalMinutes,
      billableMinutes: t.billableMinutes + r.billableMinutes,
      nonBillableMinutes: t.nonBillableMinutes + r.nonBillableMinutes,
    }),
    { totalMinutes: 0, billableMinutes: 0, nonBillableMinutes: 0 },
  );
  return { from: q.from, to: q.to, groupBy: q.groupBy, totals, rows };
}
