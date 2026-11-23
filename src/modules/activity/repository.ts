// Prisma access for 029-activity-presence. Only this module's tables.
import type { ActivityState, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export type Tx = Prisma.TransactionClient;

export function transaction<T>(fn: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(fn);
}

export function findSettings(orgId: string) {
  return prisma.activitySettings.findUnique({ where: { orgId } });
}
export function upsertSettings(orgId: string, data: { enabled?: boolean; idleThresholdMinutes?: number }) {
  return prisma.activitySettings.upsert({ where: { orgId }, update: data, create: { orgId, ...data } });
}

export function findPresence(employeeId: string, tx?: Tx) {
  return (tx ?? prisma).activityPresence.findUnique({ where: { employeeId } });
}
export function listPresence(orgId: string, employeeIds: string[]) {
  return prisma.activityPresence.findMany({ where: { orgId, employeeId: { in: employeeIds } } });
}
export function upsertPresence(tx: Tx, data: { orgId: string; employeeId: string; state: ActivityState; lastSeenAt: Date; spanId: string }) {
  const { employeeId, ...rest } = data;
  return tx.activityPresence.upsert({ where: { employeeId }, update: rest, create: data });
}

export function findSpan(tx: Tx, id: string) {
  return tx.activitySpan.findUnique({ where: { id } });
}
export function createSpan(tx: Tx, data: { orgId: string; employeeId: string; state: ActivityState; startedAt: Date; endedAt: Date }) {
  return tx.activitySpan.create({ data });
}
export function extendSpan(tx: Tx, id: string, endedAt: Date) {
  return tx.activitySpan.update({ where: { id }, data: { endedAt } });
}

// Spans overlapping [from, to) for these employees.
export function listSpans(orgId: string, employeeIds: string[], from: Date, to: Date) {
  return prisma.activitySpan.findMany({
    where: { orgId, employeeId: { in: employeeIds }, startedAt: { lt: to }, endedAt: { gt: from } },
    orderBy: { startedAt: "asc" },
  });
}

export function purgeSpansBefore(cutoff: Date) {
  return prisma.activitySpan.deleteMany({ where: { endedAt: { lt: cutoff } } }).then((r) => r.count);
}
