// Prisma queries only — this is the one place in the bgv module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "@prisma/client";

const withItems = { items: { orderBy: { createdAt: "asc" as const } } };

export function findSettings(orgId: string) {
  return prisma.backgroundCheckSettings.findUnique({ where: { orgId } });
}

export function upsertSettings(orgId: string, defaultItems: string[]) {
  return prisma.backgroundCheckSettings.upsert({ where: { orgId }, create: { orgId, defaultItems }, update: { defaultItems } });
}

export function createCheck(orgId: string, applicationId: string, labels: string[], initiatedById: string | null) {
  return prisma.backgroundCheck.create({
    data: { orgId, applicationId, initiatedById, items: { create: labels.map((label) => ({ orgId, label })) } },
    include: withItems,
  });
}

export function findCheck(orgId: string, id: string) {
  return prisma.backgroundCheck.findFirst({ where: { id, orgId }, include: withItems });
}

export function findCheckByApplication(orgId: string, applicationId: string) {
  return prisma.backgroundCheck.findFirst({ where: { orgId, applicationId }, include: withItems });
}

export function listChecks(orgId: string, where: Prisma.BackgroundCheckWhereInput = {}) {
  return prisma.backgroundCheck.findMany({ where: { orgId, ...where }, include: withItems, orderBy: { createdAt: "desc" } });
}

export function findItem(orgId: string, id: string) {
  return prisma.backgroundCheckItem.findFirst({ where: { id, orgId } });
}

// A result is recorded once (history kept; corrections go through a new item).
export function recordResult(id: string, data: { result: "CLEARED" | "FLAGGED" | "UNABLE_TO_VERIFY"; notes: string | null; recordedById: string | null }) {
  return prisma.backgroundCheckItem.updateMany({ where: { id, result: null }, data: { ...data, recordedAt: new Date() } });
}

export function addItem(orgId: string, backgroundCheckId: string, label: string) {
  return prisma.backgroundCheckItem.create({ data: { orgId, backgroundCheckId, label } });
}

export function updateCheck(id: string, data: Prisma.BackgroundCheckUncheckedUpdateInput) {
  return prisma.backgroundCheck.update({ where: { id }, data, include: withItems });
}

export function createOverride(data: Prisma.HireOverrideUncheckedCreateInput) {
  return prisma.hireOverride.create({ data });
}

export function listOverrides(orgId: string, applicationId: string) {
  return prisma.hireOverride.findMany({ where: { orgId, applicationId }, orderBy: { createdAt: "asc" } });
}

export function deleteForApplications(applicationIds: string[]) {
  return prisma.$transaction([
    prisma.backgroundCheckItem.deleteMany({ where: { backgroundCheck: { applicationId: { in: applicationIds } } } }),
    prisma.backgroundCheck.deleteMany({ where: { applicationId: { in: applicationIds } } }),
    prisma.hireOverride.deleteMany({ where: { applicationId: { in: applicationIds } } }),
  ]);
}

export function writeActivityLog(params: { orgId: string; actorId: string; action: string; entity: string; entityId: string; after?: unknown }) {
  return prisma.activityLog.create({ data: { ...params, after: params.after as Prisma.InputJsonValue | undefined } });
}
