// Prisma access for 028-time-tracker. Only this module's tables (+ the shared ActivityLog).
import type { Prisma, TimesheetStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export type Tx = Prisma.TransactionClient;
const db = (tx?: Tx) => tx ?? prisma;

export function transaction<T>(fn: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(fn);
}

// --- Projects ---
const projectInclude = { _count: { select: { members: true } } } as const;

export function createProject(data: Prisma.TimeProjectUncheckedCreateInput) {
  return prisma.timeProject.create({ data, include: projectInclude });
}
export function updateProject(id: string, data: Prisma.TimeProjectUncheckedUpdateInput) {
  return prisma.timeProject.update({ where: { id }, data, include: projectInclude });
}
export function findProject(orgId: string, id: string) {
  return prisma.timeProject.findFirst({ where: { id, orgId }, include: projectInclude });
}
export function findProjectDetail(orgId: string, id: string) {
  return prisma.timeProject.findFirst({
    where: { id, orgId },
    include: { ...projectInclude, tasks: { orderBy: { createdAt: "asc" } }, members: { orderBy: { addedAt: "asc" } } },
  });
}
export function listProjects(orgId: string, where: Prisma.TimeProjectWhereInput) {
  return prisma.timeProject.findMany({ where: { orgId, ...where }, include: projectInclude, orderBy: { name: "asc" } });
}
export function listProjectsByIds(orgId: string, ids: string[]) {
  return prisma.timeProject.findMany({ where: { orgId, id: { in: ids } }, select: { id: true, name: true, code: true } });
}

// --- Members ---
export function isMember(projectId: string, employeeId: string) {
  return prisma.timeProjectMember.count({ where: { projectId, employeeId } }).then((n) => n > 0);
}
export function memberProjectIds(orgId: string, employeeIds: string[]) {
  return prisma.timeProjectMember
    .findMany({ where: { orgId, employeeId: { in: employeeIds } }, select: { projectId: true } })
    .then((rows) => [...new Set(rows.map((r) => r.projectId))]);
}
export function addMembers(orgId: string, projectId: string, employeeIds: string[]) {
  return prisma.timeProjectMember.createMany({
    data: employeeIds.map((employeeId) => ({ orgId, projectId, employeeId })),
    skipDuplicates: true,
  });
}
export function removeMember(projectId: string, employeeId: string) {
  return prisma.timeProjectMember.deleteMany({ where: { projectId, employeeId } });
}

// --- Tasks ---
export function createTask(data: Prisma.TimeTaskUncheckedCreateInput) {
  return prisma.timeTask.create({ data });
}
export function updateTask(id: string, data: Prisma.TimeTaskUncheckedUpdateInput) {
  return prisma.timeTask.update({ where: { id }, data });
}
export function findTask(orgId: string, id: string) {
  return prisma.timeTask.findFirst({ where: { id, orgId }, include: { project: true } });
}
export function listTasksByIds(orgId: string, ids: string[]) {
  return prisma.timeTask.findMany({ where: { orgId, id: { in: ids } }, select: { id: true, name: true } });
}

// --- Entries ---
const entryInclude = { project: { select: { name: true, code: true } }, task: { select: { name: true } } } as const;

export function createEntry(data: Prisma.TimeEntryUncheckedCreateInput, tx?: Tx) {
  return db(tx).timeEntry.create({ data, include: entryInclude });
}
export function updateEntry(id: string, data: Prisma.TimeEntryUncheckedUpdateInput) {
  return prisma.timeEntry.update({ where: { id }, data, include: entryInclude });
}
export function deleteEntry(id: string) {
  return prisma.timeEntry.delete({ where: { id } });
}
export function findEntry(orgId: string, id: string) {
  return prisma.timeEntry.findFirst({ where: { id, orgId }, include: entryInclude });
}
export function listEntries(orgId: string, where: Prisma.TimeEntryWhereInput) {
  return prisma.timeEntry.findMany({
    where: { orgId, ...where },
    include: entryInclude,
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
}
export function sumMinutesOnDate(orgId: string, employeeId: string, date: Date, excludeId?: string, tx?: Tx) {
  return db(tx)
    .timeEntry.aggregate({
      where: { orgId, employeeId, date, ...(excludeId ? { id: { not: excludeId } } : {}) },
      _sum: { minutes: true },
    })
    .then((r) => r._sum.minutes ?? 0);
}
export function countEntriesInWeek(orgId: string, employeeId: string, weekStart: Date) {
  return prisma.timeEntry.count({ where: { orgId, employeeId, weekStart } });
}
export function weekTotals(orgId: string, employeeIds: string[], weekStart: Date) {
  return prisma.timeEntry.groupBy({
    by: ["employeeId", "flagged"],
    where: { orgId, employeeId: { in: employeeIds }, weekStart },
    _sum: { minutes: true },
    _count: { _all: true },
  });
}
export function groupEntries(
  orgId: string,
  by: "projectId" | "employeeId" | "taskId",
  where: Prisma.TimeEntryWhereInput,
) {
  return prisma.timeEntry.groupBy({
    by: [by, "billable"],
    where: { orgId, ...where },
    _sum: { minutes: true },
  });
}
export function approvedWeeks(orgId: string, employeeIds: string[] | undefined, from: Date, to: Date) {
  return prisma.timesheet.findMany({
    where: {
      orgId,
      status: "APPROVED",
      weekStart: { gte: from, lte: to },
      ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
    },
    select: { employeeId: true, weekStart: true },
  });
}

// --- Timer ---
const timerInclude = { task: { select: { name: true, project: { select: { name: true } } } } } as const;

export function findTimer(orgId: string, employeeId: string, tx?: Tx) {
  return db(tx).runningTimer.findFirst({ where: { orgId, employeeId }, include: timerInclude });
}
export function createTimer(data: Prisma.RunningTimerUncheckedCreateInput, tx?: Tx) {
  return db(tx).runningTimer.create({ data, include: timerInclude });
}
export function updateTimer(id: string, data: Prisma.RunningTimerUncheckedUpdateInput) {
  return prisma.runningTimer.update({ where: { id }, data, include: timerInclude });
}
export function deleteTimer(id: string, tx?: Tx) {
  return db(tx).runningTimer.deleteMany({ where: { id } });
}

// --- Timesheets ---
export function findTimesheet(orgId: string, employeeId: string, weekStart: Date, tx?: Tx) {
  return db(tx).timesheet.findFirst({ where: { orgId, employeeId, weekStart } });
}
export function findTimesheetById(orgId: string, id: string) {
  return prisma.timesheet.findFirst({ where: { orgId, id } });
}
export function listTimesheets(orgId: string, employeeIds: string[], weekStart: Date) {
  return prisma.timesheet.findMany({ where: { orgId, employeeId: { in: employeeIds }, weekStart } });
}
export function upsertTimesheet(orgId: string, employeeId: string, weekStart: Date, tx?: Tx) {
  return db(tx).timesheet.upsert({
    where: { employeeId_weekStart: { employeeId, weekStart } },
    update: {},
    create: { orgId, employeeId, weekStart },
  });
}
// R7: conditional transition — only applies if the row is still in one of `from`.
export function transitionTimesheet(id: string, from: TimesheetStatus[], data: Prisma.TimesheetUncheckedUpdateInput) {
  return prisma.timesheet.updateMany({ where: { id, status: { in: from } }, data }).then((r) => r.count === 1);
}

// --- Audit ---
export function writeActivityLog(data: {
  orgId: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}) {
  return prisma.activityLog.create({ data });
}
