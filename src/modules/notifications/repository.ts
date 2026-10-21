// Prisma queries only — this is the one place in the notifications module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";

export function createNotification(data: {
  orgId: string;
  userId: string;
  type: string;
  message: string;
  link?: string | null;
}) {
  return prisma.notification.create({ data });
}

export function listForUser(
  orgId: string,
  userId: string,
  opts: { unreadOnly?: boolean; before?: Date; limit: number },
) {
  return prisma.notification.findMany({
    where: {
      orgId,
      userId,
      ...(opts.unreadOnly ? { read: false } : {}),
      ...(opts.before ? { createdAt: { lt: opts.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit,
  });
}

export function countUnread(orgId: string, userId: string) {
  return prisma.notification.count({ where: { orgId, userId, read: false } });
}

// Scoped by userId so a user can only ever flip their own notifications.
export function markRead(orgId: string, userId: string, id: string) {
  return prisma.notification.updateMany({ where: { id, orgId, userId }, data: { read: true } });
}

export function markAllRead(orgId: string, userId: string) {
  return prisma.notification.updateMany({ where: { orgId, userId, read: false }, data: { read: true } });
}
