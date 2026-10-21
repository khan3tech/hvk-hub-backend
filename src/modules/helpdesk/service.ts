// Business rules for the HR helpdesk. Framework-agnostic — no req/res.
// Implements specs/017-hr-helpdesk-ticketing/spec.md.
import { Prisma } from "@prisma/client";
import { DomainError } from "../../middleware/errorHandler.js";
import { listUsersByRole } from "../auth/service.js";
import { getEmployeeSummary } from "../employee/service.js";
import { notifyEmployees, notifyRoles } from "../notifications/service.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";

export const DEFAULT_CATEGORIES = ["Payroll", "Leave", "Personal details", "General"];
export const DEFAULT_OVERDUE_HOURS = 48;
const HOUR = 3_600_000;

type Ticket = Awaited<ReturnType<typeof repo.listTickets>>[number] & { replies?: Array<{ id: string; authorId: string; fromHr: boolean; message: string; createdAt: Date }> };

const isHr = (actor: AccessTokenPayload) => actor.role === "HR" || actor.role === "ADMIN";

async function overdueHours(orgId: string) {
  return (await repo.findSettings(orgId))?.overdueHours ?? DEFAULT_OVERDUE_HOURS;
}

// FR-009/SC-003: overdue = still waiting on HR longer than the threshold.
export function isOverdue(t: { status: string; awaitingHrSince: Date | null }, thresholdHours: number, now = new Date()) {
  return t.status !== "RESOLVED" && t.awaitingHrSince !== null && now.getTime() - t.awaitingHrSince.getTime() > thresholdHours * HOUR;
}

// FR-008: a ticket carries only its own text; nothing from other modules is joined in.
function present(t: Ticket, threshold: number) {
  const { category, ...rest } = t;
  return {
    ...rest,
    category: category.name,
    overdue: isOverdue(t, threshold),
    unassigned: t.status !== "RESOLVED" && !t.assigneeId,
  };
}

// --- Categories (FR-002) ---

export async function listCategories(orgId: string, activeOnly = true) {
  if ((await repo.listCategories(orgId, false)).length === 0) {
    await repo.createCategories(DEFAULT_CATEGORIES.map((name) => ({ orgId, name })));
  }
  return repo.listCategories(orgId, activeOnly);
}

export async function createCategory(orgId: string, name: string) {
  await listCategories(orgId);
  try {
    return await repo.createCategory(orgId, name);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DomainError("CATEGORY_EXISTS", "A category with this name already exists.", 409);
    }
    throw err;
  }
}

export async function updateCategory(orgId: string, id: string, input: { name?: string; active?: boolean }) {
  if (!(await repo.findCategory(orgId, id))) throw new DomainError("NOT_FOUND", "Category not found.", 404);
  return repo.updateCategory(id, input);
}

export async function getSettings(orgId: string) {
  return { overdueHours: await overdueHours(orgId) };
}

export async function updateSettings(orgId: string, hours: number) {
  await repo.upsertSettings(orgId, hours);
  return getSettings(orgId);
}

// --- Tickets ---

// FR-001: self-service only (Assumptions — no raising on someone's behalf).
export async function raiseTicket(orgId: string, input: { categoryId: string; subject: string; description: string }, actor: AccessTokenPayload) {
  if (!actor.employeeId) throw new DomainError("FORBIDDEN", "Only employees raise tickets.", 403);
  await listCategories(orgId);
  const category = await repo.findCategory(orgId, input.categoryId);
  if (!category || !category.active) {
    throw new DomainError("VALIDATION_ERROR", "Pick one of the active ticket categories.", 400, { categoryId: ["Unknown category."] });
  }
  const now = new Date();
  const ticket = await repo.createTicket({
    orgId,
    employeeId: actor.employeeId,
    categoryId: category.id,
    subject: input.subject,
    description: input.description,
    awaitingHrSince: now,
  });
  await notifyRoles(orgId, ["HR"], { type: "TICKET_RAISED", message: `New ${category.name} ticket: ${input.subject}`, link: `/helpdesk/tickets/${ticket.id}` });
  return present(ticket, await overdueHours(orgId));
}

// FR-007: the requester's own tickets only.
export async function myTickets(orgId: string, actor: AccessTokenPayload) {
  if (!actor.employeeId) return [];
  const threshold = await overdueHours(orgId);
  return (await repo.listTickets(orgId, { employeeId: actor.employeeId })).map((t) => present(t, threshold));
}

// FR-003/US2.3: HR queue — active (not resolved) by default, filterable.
export async function queue(orgId: string, filters: { status?: string; categoryId?: string; includeResolved?: boolean }) {
  const where: Prisma.TicketWhereInput = {};
  if (filters.status) where.status = filters.status as Prisma.EnumTicketStatusFilter["equals"];
  else if (!filters.includeResolved) where.status = { not: "RESOLVED" };
  if (filters.categoryId) where.categoryId = filters.categoryId;
  const threshold = await overdueHours(orgId);
  return (await repo.listTickets(orgId, where)).map((t) => present(t, threshold));
}

async function loadVisible(orgId: string, id: string, actor: AccessTokenPayload) {
  const ticket = await repo.findTicket(orgId, id);
  // Someone else's ticket looks exactly like a missing one (FR-007/008, SC-005).
  if (!ticket || (!isHr(actor) && ticket.employeeId !== actor.employeeId)) {
    throw new DomainError("NOT_FOUND", "Ticket not found.", 404);
  }
  return ticket;
}

export async function getTicket(orgId: string, id: string, actor: AccessTokenPayload) {
  return present(await loadVisible(orgId, id, actor), await overdueHours(orgId));
}

// FR-004: assign to an active HR/Admin team member (self included).
export async function assign(orgId: string, id: string, assigneeId: string, actor: AccessTokenPayload) {
  const ticket = await loadVisible(orgId, id, actor);
  if (ticket.status === "RESOLVED") throw new DomainError("INVALID_STATE", "Reopen a resolved ticket before reassigning it.", 409);
  const hrUsers = await listUsersByRole(orgId, ["HR", "ADMIN"]);
  const assignee = await getEmployeeSummary(orgId, assigneeId);
  if (!assignee || assignee.status !== "ACTIVE" || !hrUsers.some((u) => u.employeeId === assigneeId)) {
    throw new DomainError("VALIDATION_ERROR", "Tickets can only be assigned to an active HR/Admin team member.", 400, { assigneeId: ["Not on the HR team."] });
  }
  await repo.updateTicket(id, { assigneeId, status: ticket.status === "OPEN" ? "ASSIGNED" : ticket.status });
  if (assigneeId !== actor.employeeId) {
    await notifyEmployees(orgId, [assigneeId], { type: "TICKET_ASSIGNED", message: `You were assigned a ticket: ${ticket.subject ?? ticket.description.slice(0, 60)}`, link: `/helpdesk/tickets/${id}` });
  }
  return getTicket(orgId, id, actor);
}

// FR-005 (HR replies) and the requester's follow-ups. An HR reply stops the overdue clock; a
// requester reply restarts it.
export async function reply(orgId: string, id: string, message: string, actor: AccessTokenPayload) {
  const ticket = await loadVisible(orgId, id, actor);
  if (!actor.employeeId) throw new DomainError("FORBIDDEN", "Only employees post replies.", 403);
  if (ticket.status === "RESOLVED") throw new DomainError("INVALID_STATE", "This ticket is resolved — reopen it to continue.", 409);
  const fromHr = isHr(actor) && ticket.employeeId !== actor.employeeId;
  await repo.addReply({ orgId, ticketId: id, authorId: actor.employeeId, message, fromHr });
  await repo.updateTicket(id, { awaitingHrSince: fromHr ? null : new Date() });
  if (fromHr) {
    await notifyEmployees(orgId, [ticket.employeeId], { type: "TICKET_UPDATED", message: `HR replied to your ticket: ${ticket.subject ?? ""}`.trim(), link: `/helpdesk/tickets/${id}` });
  }
  return getTicket(orgId, id, actor);
}

// FR-006: HR resolves; the requester (only) can reopen.
export async function resolve(orgId: string, id: string, actor: AccessTokenPayload) {
  const ticket = await loadVisible(orgId, id, actor);
  const { count } = await repo.transition(id, ["OPEN", "ASSIGNED", "REOPENED"], { status: "RESOLVED", resolvedAt: new Date(), awaitingHrSince: null });
  if (count === 0) throw new DomainError("INVALID_STATE", "This ticket is already resolved.", 409);
  await notifyEmployees(orgId, [ticket.employeeId], { type: "TICKET_UPDATED", message: `Your ticket was resolved: ${ticket.subject ?? ""}`.trim(), link: `/helpdesk/tickets/${id}` });
  return getTicket(orgId, id, actor);
}

export async function reopen(orgId: string, id: string, actor: AccessTokenPayload) {
  const ticket = await loadVisible(orgId, id, actor);
  if (ticket.employeeId !== actor.employeeId) throw new DomainError("FORBIDDEN", "Only the person who raised a ticket can reopen it.", 403);
  const { count } = await repo.transition(id, ["RESOLVED"], { status: "REOPENED", awaitingHrSince: new Date() });
  if (count === 0) throw new DomainError("INVALID_STATE", "Only a resolved ticket can be reopened.", 409);
  if (ticket.assigneeId) {
    await notifyEmployees(orgId, [ticket.assigneeId], { type: "TICKET_UPDATED", message: `A ticket you handled was reopened: ${ticket.subject ?? ""}`.trim(), link: `/helpdesk/tickets/${id}` });
  }
  return getTicket(orgId, id, actor);
}

// FR-010/SC-004: open/resolved per category and mean created→resolved hours.
export async function summary(orgId: string) {
  const [categories, tickets, threshold] = await Promise.all([listCategories(orgId, false), repo.listTickets(orgId, {}), overdueHours(orgId)]);
  return {
    overdueHours: threshold,
    categories: categories.map((c) => {
      const mine = tickets.filter((t) => t.categoryId === c.id);
      const resolved = mine.filter((t) => t.status === "RESOLVED" && t.resolvedAt);
      const avg = resolved.length
        ? Math.round((resolved.reduce((s, t) => s + (t.resolvedAt!.getTime() - t.createdAt.getTime()), 0) / resolved.length / HOUR) * 100) / 100
        : null;
      return { categoryId: c.id, name: c.name, open: mine.length - resolved.length, resolved: resolved.length, averageResolutionHours: avg };
    }),
  };
}
