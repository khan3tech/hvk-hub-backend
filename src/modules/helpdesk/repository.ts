// Prisma queries only — this is the one place in the helpdesk module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";
import type { Prisma, TicketStatus } from "@prisma/client";

export function listCategories(orgId: string, activeOnly: boolean) {
  return prisma.ticketCategory.findMany({ where: { orgId, ...(activeOnly ? { active: true } : {}) }, orderBy: { name: "asc" } });
}

export function createCategories(rows: Prisma.TicketCategoryCreateManyInput[]) {
  return prisma.ticketCategory.createMany({ data: rows, skipDuplicates: true });
}

export function createCategory(orgId: string, name: string) {
  return prisma.ticketCategory.create({ data: { orgId, name } });
}

export function findCategory(orgId: string, id: string) {
  return prisma.ticketCategory.findFirst({ where: { id, orgId } });
}

export function updateCategory(id: string, data: Prisma.TicketCategoryUncheckedUpdateInput) {
  return prisma.ticketCategory.update({ where: { id }, data });
}

const withCategory = { category: { select: { name: true } } };

export function createTicket(data: Prisma.TicketUncheckedCreateInput) {
  return prisma.ticket.create({ data, include: withCategory });
}

export function findTicket(orgId: string, id: string) {
  return prisma.ticket.findFirst({
    where: { id, orgId },
    include: { ...withCategory, replies: { orderBy: { createdAt: "asc" } } },
  });
}

export function listTickets(orgId: string, where: Prisma.TicketWhereInput) {
  return prisma.ticket.findMany({ where: { orgId, ...where }, include: withCategory, orderBy: { createdAt: "asc" } });
}

// Conditional on the current status, so concurrent resolve/reopen can't both land.
export function transition(id: string, from: TicketStatus[], data: Prisma.TicketUncheckedUpdateInput) {
  return prisma.ticket.updateMany({ where: { id, status: { in: from } }, data });
}

export function updateTicket(id: string, data: Prisma.TicketUncheckedUpdateInput) {
  return prisma.ticket.update({ where: { id }, data });
}

export function addReply(data: Prisma.TicketReplyUncheckedCreateInput) {
  return prisma.ticketReply.create({ data });
}

export function findSettings(orgId: string) {
  return prisma.helpdeskSettings.findUnique({ where: { orgId } });
}

export function upsertSettings(orgId: string, overdueHours: number) {
  return prisma.helpdeskSettings.upsert({ where: { orgId }, create: { orgId, overdueHours }, update: { overdueHours } });
}
