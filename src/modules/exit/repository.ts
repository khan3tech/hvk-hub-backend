// Prisma queries only — this is the one place in the exit module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";
import type { ExitTaskOwnerRole, Prisma, ResignationStatus } from "@prisma/client";

const ACTIVE: ResignationStatus[] = ["PENDING", "SERVING_NOTICE"];

export function findActiveResignation(orgId: string, employeeId: string) {
  return prisma.resignation.findFirst({ where: { orgId, employeeId, status: { in: ACTIVE } } });
}

export function createResignation(data: Prisma.ResignationUncheckedCreateInput) {
  return prisma.resignation.create({ data });
}

export function findResignation(orgId: string, id: string) {
  return prisma.resignation.findFirst({ where: { id, orgId } });
}

export function listResignations(orgId: string, where: Prisma.ResignationWhereInput = {}) {
  return prisma.resignation.findMany({ where: { orgId, ...where }, orderBy: { createdAt: "desc" } });
}

export function activeResignationsFor(orgId: string, employeeIds: string[]) {
  return prisma.resignation.findMany({ where: { orgId, employeeId: { in: employeeIds }, status: { in: ACTIVE } } });
}

// Conditional transitions: only from the expected status (no double acknowledge/withdraw).
export function transition(id: string, from: ResignationStatus[], data: Prisma.ResignationUncheckedUpdateInput) {
  return prisma.resignation.updateMany({ where: { id, status: { in: from } }, data });
}

export function updateResignation(id: string, data: Prisma.ResignationUncheckedUpdateInput) {
  return prisma.resignation.update({ where: { id }, data });
}

export function createChecklist(
  orgId: string,
  resignationId: string,
  tasks: Array<{ ownerRole: ExitTaskOwnerRole; description: string }>,
  reportsToReassign: Prisma.InputJsonValue | null,
) {
  return prisma.exitChecklist.create({
    data: {
      orgId,
      resignationId,
      reportsToReassign: reportsToReassign ?? undefined,
      tasks: { create: tasks.map((t) => ({ orgId, ...t })) },
    },
    include: { tasks: true },
  });
}

export function findChecklistByResignation(orgId: string, resignationId: string) {
  return prisma.exitChecklist.findFirst({
    where: { orgId, resignationId },
    include: { tasks: { orderBy: { ownerRole: "asc" } } },
  });
}

export function closeChecklist(resignationId: string) {
  return prisma.exitChecklist.updateMany({ where: { resignationId, closedAt: null }, data: { closedAt: new Date() } });
}

export function findTask(orgId: string, id: string) {
  return prisma.exitTask.findFirst({ where: { id, orgId }, include: { checklist: { include: { resignation: true } } } });
}

export function completeTask(id: string, completedById: string) {
  return prisma.exitTask.updateMany({
    where: { id, status: "INCOMPLETE" },
    data: { status: "COMPLETE", completedById, completedAt: new Date() },
  });
}

// Serving notice, last day before `before`, not yet prompted.
export function findExitsDue(before: Date) {
  return prisma.resignation.findMany({
    where: { status: "SERVING_NOTICE", confirmedLastDay: { lt: before }, exitDuePromptedAt: null },
  });
}

export function writeActivityLog(params: {
  orgId: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}) {
  return prisma.activityLog.create({
    data: {
      ...params,
      before: params.before as Prisma.InputJsonValue | undefined,
      after: params.after as Prisma.InputJsonValue | undefined,
    },
  });
}
