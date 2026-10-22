// Prisma queries only — this is the one place in the branding module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";

export function findBranding(orgId: string) {
  return prisma.organizationBranding.findUnique({ where: { orgId } });
}

export function upsertBranding(orgId: string, data: { primaryColor?: string | null; logoUrl?: string | null; logoContentType?: string | null; logoUpdatedAt?: Date | null; updatedById: string | null }) {
  return prisma.organizationBranding.upsert({ where: { orgId }, create: { orgId, ...data }, update: data });
}

export function deleteBranding(orgId: string) {
  return prisma.organizationBranding.deleteMany({ where: { orgId } });
}
