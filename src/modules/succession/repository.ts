// Prisma queries only — this is the one place in the succession module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";
import type { Prisma, ReadinessLevel } from "@prisma/client";

const person = { select: { id: true, name: true, status: true, departmentId: true, department: { select: { name: true } } } } as const;
const planInclude = {
  positionEmployee: person,
  candidates: {
    include: { candidateEmployee: person, readinessChanges: { orderBy: { changedAt: "asc" as const } } },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

export function findEmployee(orgId: string, id: string) {
  return prisma.employee.findFirst({ where: { orgId, id }, select: { id: true, status: true } });
}

export function findPlanByPosition(orgId: string, positionEmployeeId: string) {
  return prisma.successionPlan.findFirst({ where: { orgId, positionEmployeeId }, include: planInclude });
}

export function listCriticalPlans(orgId: string, where: Prisma.SuccessionPlanWhereInput = {}) {
  return prisma.successionPlan.findMany({ where: { orgId, isCritical: true, ...where }, include: planInclude, orderBy: { markedAt: "asc" } });
}

export async function criticalPositionIds(orgId: string, employeeIds?: string[]) {
  const rows = await prisma.successionPlan.findMany({
    where: { orgId, isCritical: true, ...(employeeIds ? { positionEmployeeId: { in: employeeIds } } : {}) },
    select: { positionEmployeeId: true },
  });
  return new Set(rows.map((r) => r.positionEmployeeId));
}

export function upsertPlan(orgId: string, positionEmployeeId: string, markedById: string | null) {
  return prisma.successionPlan.upsert({
    where: { positionEmployeeId },
    create: { orgId, positionEmployeeId, markedById },
    update: { isCritical: true, markedById, markedAt: new Date(), unmarkedAt: null },
  });
}

export function unmarkPlan(id: string) {
  return prisma.successionPlan.updateMany({ where: { id, isCritical: true }, data: { isCritical: false, unmarkedAt: new Date() } });
}

export function findCandidate(orgId: string, id: string) {
  return prisma.successionCandidate.findFirst({ where: { orgId, id }, include: { successionPlan: { select: { positionEmployeeId: true } } } });
}

export function findCandidateOnPlan(successionPlanId: string, candidateEmployeeId: string) {
  return prisma.successionCandidate.findUnique({ where: { successionPlanId_candidateEmployeeId: { successionPlanId, candidateEmployeeId } } });
}

export function addCandidate(data: { orgId: string; successionPlanId: string; candidateEmployeeId: string; readinessLevel: ReadinessLevel; addedById: string | null; note: string | null }) {
  const { note, ...row } = data;
  return prisma.successionCandidate.create({
    data: { ...row, readinessChanges: { create: { orgId: data.orgId, toLevel: data.readinessLevel, note, changedById: data.addedById } } },
  });
}

// Re-adding someone previously removed keeps their earlier history on the same entry.
export function reinstateCandidate(id: string, orgId: string, readinessLevel: ReadinessLevel, fromLevel: ReadinessLevel, changedById: string | null, note: string | null) {
  return prisma.successionCandidate.update({
    where: { id },
    data: { isValid: true, invalidReason: null, invalidatedAt: null, readinessLevel, readinessChanges: { create: { orgId, fromLevel, toLevel: readinessLevel, note, changedById } } },
  });
}

// FR-004: the level and its history row change together.
export function changeReadiness(id: string, orgId: string, fromLevel: ReadinessLevel, toLevel: ReadinessLevel, changedById: string | null, note: string | null) {
  return prisma.$transaction([
    prisma.successionCandidate.update({ where: { id }, data: { readinessLevel: toLevel } }),
    prisma.successionReadinessChange.create({ data: { orgId, candidateId: id, fromLevel, toLevel, changedById, note } }),
  ]);
}

export function invalidateCandidate(id: string, reason: string) {
  return prisma.successionCandidate.updateMany({ where: { id, isValid: true }, data: { isValid: false, invalidReason: reason, invalidatedAt: new Date() } });
}

// FR-005: every plan the leaver was on, in one statement.
export function invalidateCandidacies(orgId: string, candidateEmployeeId: string, reason: string) {
  return prisma.successionCandidate.updateMany({
    where: { orgId, candidateEmployeeId, isValid: true },
    data: { isValid: false, invalidReason: reason, invalidatedAt: new Date() },
  });
}

export function writeActivityLog(params: { orgId: string; actorId: string; action: string; entity: string; entityId: string; after?: unknown }) {
  return prisma.activityLog.create({ data: { ...params, after: params.after as Prisma.InputJsonValue | undefined } });
}
