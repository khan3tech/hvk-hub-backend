// Prisma queries only — this is the one place in the statutory module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "@prisma/client";

export function createVersion(data: Prisma.StatutoryComponentUncheckedCreateInput) {
  return prisma.statutoryComponent.create({ data });
}

export function listVersions(orgId: string, where: Prisma.StatutoryComponentWhereInput = {}) {
  return prisma.statutoryComponent.findMany({
    where: { orgId, ...where },
    orderBy: [{ groupId: "asc" }, { effectiveFrom: "asc" }, { createdAt: "asc" }],
  });
}

export function findGroupRoot(orgId: string, groupId: string) {
  return prisma.statutoryComponent.findFirst({ where: { orgId, groupId }, orderBy: { createdAt: "asc" } });
}

export function listExemptions(orgId: string, where: Prisma.StatutoryExemptionWhereInput = {}) {
  return prisma.statutoryExemption.findMany({ where: { orgId, ...where }, orderBy: { createdAt: "desc" } });
}

export function createExemption(data: Prisma.StatutoryExemptionUncheckedCreateInput) {
  return prisma.statutoryExemption.create({ data });
}

export function findExemption(orgId: string, id: string) {
  return prisma.statutoryExemption.findFirst({ where: { id, orgId } });
}

export function deleteExemption(id: string) {
  return prisma.statutoryExemption.delete({ where: { id } });
}

export function createReport(data: Prisma.ComplianceReportUncheckedCreateInput) {
  return prisma.complianceReport.create({ data });
}

export function findReport(orgId: string, id: string) {
  return prisma.complianceReport.findFirst({ where: { id, orgId } });
}

export function listReports(orgId: string, where: Prisma.ComplianceReportWhereInput = {}) {
  return prisma.complianceReport.findMany({ where: { orgId, ...where }, orderBy: { generatedAt: "desc" } });
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
