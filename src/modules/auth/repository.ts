// Prisma queries only — this is the one place in the auth module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
// See specs/001-auth-rbac/spec.md → Key Entities for the data this module owns.
import moment from "moment";
import { prisma } from "../../lib/prisma.js";

export function findUserByEmail(orgId: string, email: string) {
  return prisma.user.findUnique({
    where: { orgId_email: { orgId, email: email.toLowerCase() } },
    include: { employee: { select: { status: true } } },
  });
}

export function findUserById(orgId: string, userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, orgId },
  });
}

export function incrementFailedAttempts(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
  });
}

export function resetFailedAttempts(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0 },
  });
}

export function lockUser(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { lockedAt: moment().toDate() },
  });
}

export function unlockUser(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedAt: null },
  });
}

export function createRefreshToken(params: {
  orgId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  return prisma.refreshToken.create({ data: params });
}

export function findActiveRefreshTokenByHash(tokenHash: string) {
  return prisma.refreshToken.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: moment().toDate() } },
    include: { user: { include: { employee: { select: { status: true } } } } },
  });
}

export function revokeRefreshToken(id: string) {
  return prisma.refreshToken.update({
    where: { id },
    data: { revokedAt: moment().toDate() },
  });
}

export function revokeAllRefreshTokensForUser(userId: string) {
  return prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: moment().toDate() },
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
      orgId: params.orgId,
      actorId: params.actorId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      before: params.before as never,
      after: params.after as never,
    },
  });
}
