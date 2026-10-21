// Prisma queries only — this is the one place in the organizations module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";
import type { OrganizationStatus } from "@prisma/client";

export function createOrganization(data: { name: string; slug: string }) {
  return prisma.organization.create({ data });
}

export function deleteOrganization(id: string) {
  return prisma.organization.delete({ where: { id } });
}

export function findOrganization(id: string) {
  return prisma.organization.findUnique({ where: { id } });
}

export function findOrganizationBySlug(slug: string) {
  return prisma.organization.findUnique({ where: { slug } });
}

export function listOrganizations() {
  return prisma.organization.findMany({ orderBy: { createdAt: "asc" } });
}

export function setStatus(id: string, status: OrganizationStatus) {
  return prisma.organization.update({ where: { id }, data: { status, suspendedAt: status === "SUSPENDED" ? new Date() : null } });
}

// FR-008: counts and a timestamp only — never HR content. User and ActivityLog are read as
// aggregates here because usage is a platform concern spanning every module's audit trail.
export async function usageFor(orgId: string) {
  const [users, last] = await Promise.all([
    prisma.user.count({ where: { orgId } }),
    prisma.activityLog.findFirst({ where: { orgId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  return { users, lastActivityAt: last?.createdAt ?? null };
}

export function findSuperAdminByEmail(email: string) {
  return prisma.superAdmin.findUnique({ where: { email: email.toLowerCase() } });
}

export function findSuperAdmin(id: string) {
  return prisma.superAdmin.findUnique({ where: { id } });
}

export function recordSuperAdminFailure(id: string, lock: boolean) {
  return prisma.superAdmin.update({
    where: { id },
    data: lock ? { failedLoginAttempts: 0, lockedAt: new Date() } : { failedLoginAttempts: { increment: 1 } },
  });
}

export function resetSuperAdminFailures(id: string) {
  return prisma.superAdmin.update({ where: { id }, data: { failedLoginAttempts: 0 } });
}

export function setTopEmployee(id: string, topEmployeeId: string | null) {
  return prisma.organization.update({ where: { id }, data: { topEmployeeId } });
}
