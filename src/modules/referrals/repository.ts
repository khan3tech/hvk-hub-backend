// Prisma queries only — this is the one place in the referrals module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";
import type { Prisma, ReferralStatus } from "@prisma/client";

export function findConfig(orgId: string) {
  return prisma.referralProgramConfig.findUnique({ where: { orgId } });
}

export function upsertConfig(orgId: string, bonusAmount: number, qualifyingDays: number) {
  return prisma.referralProgramConfig.upsert({
    where: { orgId },
    create: { orgId, bonusAmount, qualifyingDays },
    update: { bonusAmount, qualifyingDays, effectiveFrom: new Date() },
  });
}

export function createReferral(data: Prisma.ReferralUncheckedCreateInput) {
  return prisma.referral.create({ data });
}

export function findReferral(orgId: string, id: string) {
  return prisma.referral.findFirst({ where: { id, orgId } });
}

export function findByApplication(applicationId: string) {
  return prisma.referral.findUnique({ where: { applicationId } });
}

export function listReferrals(orgId: string, where: Prisma.ReferralWhereInput = {}) {
  return prisma.referral.findMany({ where: { orgId, ...where }, orderBy: { createdAt: "desc" } });
}

// Conditional transitions so concurrent evaluations / payroll runs can't double-apply.
export function transition(id: string, from: ReferralStatus[], data: Prisma.ReferralUncheckedUpdateInput) {
  return prisma.referral.updateMany({ where: { id, status: { in: from } }, data });
}

export function update(id: string, data: Prisma.ReferralUncheckedUpdateInput) {
  return prisma.referral.update({ where: { id }, data });
}

export function deleteForApplications(applicationIds: string[]) {
  return prisma.referral.deleteMany({ where: { applicationId: { in: applicationIds } } });
}

export function listPendingAllOrgs() {
  return prisma.referral.findMany({ where: { status: "PENDING" } });
}
