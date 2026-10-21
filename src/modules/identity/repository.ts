// Prisma queries only — this is the one place in the identity module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";
import type { Prisma, SsoProvider } from "@prisma/client";

export function findConfig(orgId: string) {
  return prisma.identityProviderConfig.findUnique({ where: { orgId } });
}

export function upsertConfig(orgId: string, data: Omit<Prisma.IdentityProviderConfigUncheckedCreateInput, "orgId">) {
  return prisma.identityProviderConfig.upsert({ where: { orgId }, create: { orgId, ...data }, update: data });
}

export function findLink(provider: SsoProvider, externalId: string) {
  return prisma.ssoIdentityLink.findUnique({ where: { provider_externalId: { provider, externalId } } });
}

export function createLink(data: Prisma.SsoIdentityLinkUncheckedCreateInput) {
  return prisma.ssoIdentityLink.create({ data });
}

export function findEnrollment(userId: string) {
  return prisma.mfaEnrollment.findUnique({ where: { userId } });
}

export function upsertPendingEnrollment(orgId: string, userId: string, pendingSecret: string) {
  return prisma.mfaEnrollment.upsert({
    where: { userId },
    create: { orgId, userId, pendingSecret },
    update: { pendingSecret },
  });
}

export function updateEnrollment(userId: string, data: Prisma.MfaEnrollmentUncheckedUpdateInput) {
  return prisma.mfaEnrollment.update({ where: { userId }, data });
}

export function deleteEnrollment(userId: string) {
  return prisma.mfaEnrollment.deleteMany({ where: { userId } });
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
