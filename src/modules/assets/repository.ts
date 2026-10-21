// Prisma queries only — this is the one place in the assets module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";
import type { AssetStatus, Prisma } from "@prisma/client";

const withOpenAssignment = { assignments: { where: { returnedAt: null }, take: 1 } };

export function createAsset(data: Prisma.AssetUncheckedCreateInput) {
  return prisma.asset.create({ data, include: withOpenAssignment });
}

export function findAsset(orgId: string, id: string) {
  return prisma.asset.findFirst({ where: { id, orgId }, include: withOpenAssignment });
}

export function listAssets(orgId: string, where: Prisma.AssetWhereInput = {}) {
  return prisma.asset.findMany({ where: { orgId, ...where }, include: withOpenAssignment, orderBy: { createdAt: "desc" } });
}

// SC-004: the status flip is conditional and the assignment row is created in the same
// transaction, so two concurrent assigns can't both succeed.
export function assignAsset(orgId: string, assetId: string, employeeId: string, assignedById: string | null) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.asset.updateMany({ where: { id: assetId, orgId, status: "UNASSIGNED" }, data: { status: "ASSIGNED" } });
    if (count === 0) return null;
    return tx.assetAssignment.create({ data: { orgId, assetId, employeeId, assignedById } });
  });
}

// Closes the open assignment (if any) and moves the asset to its new status, atomically.
export function closeAssignment(assetId: string, from: AssetStatus[], to: AssetStatus, outcome: string, closedById: string | null) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.asset.updateMany({ where: { id: assetId, status: { in: from } }, data: { status: to } });
    if (count === 0) return null;
    const open = await tx.assetAssignment.findFirst({ where: { assetId, returnedAt: null } });
    if (open) await tx.assetAssignment.update({ where: { id: open.id }, data: { returnedAt: new Date(), outcome, closedById } });
    return open;
  });
}

export function openAssignmentsFor(orgId: string, employeeIds: string[]) {
  return prisma.assetAssignment.findMany({
    where: { orgId, employeeId: { in: employeeIds }, returnedAt: null },
    include: { asset: { select: { id: true, description: true, identifier: true } } },
  });
}

export function assignmentHistory(orgId: string, assetId: string) {
  return prisma.assetAssignment.findMany({ where: { orgId, assetId }, orderBy: { assignedAt: "desc" } });
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
