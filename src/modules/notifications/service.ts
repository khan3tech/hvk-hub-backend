// Business rules for the notifications module. Framework-agnostic — no req/res.
// Implements specs/006-notifications/spec.md. Other modules call notifyEmployees()/notifyRoles()/
// notifyDepartmentManagers() at their own events; delivery problems never fail the caller's
// action (FR-008, SC-002).
import { DomainError } from "../../middleware/errorHandler.js";
import { getEmailSender } from "../../lib/email.js";
import { logger } from "../../lib/logger.js";
import { findUserForEmployee, listUsersByRole } from "../auth/service.js";
import { getEmployeeSummary } from "../employee/service.js";
import * as repo from "./repository.js";
import type { Role } from "../../lib/roles.js";
import type { NotificationType } from "./schema.js";

export interface NotificationEvent {
  type: NotificationType;
  message: string;
  link?: string;
  // When present the event is also emailed (FR-001/003/004); omitted = in-app only.
  email?: { subject: string; text: string };
}

interface Recipient {
  userId: string;
  employeeId: string | null;
  email: string | null;
}

async function deliver(orgId: string, recipient: Recipient, event: NotificationEvent) {
  // research.md R1: the in-app row is written first and unconditionally.
  await repo.createNotification({
    orgId,
    userId: recipient.userId,
    type: event.type,
    message: event.message,
    link: event.link ?? null,
  });

  if (!event.email || !recipient.email) return; // in-app only, or no address (edge case)

  if (recipient.employeeId) {
    const employee = await getEmployeeSummary(orgId, recipient.employeeId);
    if (employee?.status === "OFFBOARDED") return; // FR-009, SC-004
  }

  try {
    await getEmailSender().send({
      to: recipient.email,
      subject: event.email.subject,
      text: event.email.text,
    });
  } catch (err) {
    // FR-008: a bounce or outage is logged, never surfaced to the triggering action.
    logger.warn({ err, type: event.type, userId: recipient.userId }, "notification email failed");
  }
}

async function fanOut(orgId: string, recipients: Recipient[], event: NotificationEvent) {
  const unique = new Map(recipients.map((r) => [r.userId, r]));
  for (const recipient of unique.values()) {
    try {
      await deliver(orgId, recipient, event);
    } catch (err) {
      logger.error({ err, type: event.type, userId: recipient.userId }, "notification delivery failed");
    }
  }
}

// Notify by Employee id (the id every other module holds). Employees without a login are skipped.
export async function notifyEmployees(orgId: string, employeeIds: string[], event: NotificationEvent) {
  try {
    const recipients: Recipient[] = [];
    for (const employeeId of new Set(employeeIds)) {
      const user = await findUserForEmployee(orgId, employeeId);
      if (user) recipients.push({ userId: user.id, employeeId, email: user.email });
    }
    await fanOut(orgId, recipients, event);
  } catch (err) {
    logger.error({ err, type: event.type }, "notification routing failed");
  }
}

// Notify every user holding one of these roles (e.g. HR/Admin for FR-005).
export async function notifyRoles(orgId: string, roles: Role[], event: NotificationEvent) {
  try {
    const users = await listUsersByRole(orgId, roles);
    await fanOut(
      orgId,
      users.map((u) => ({ userId: u.id, employeeId: u.employeeId, email: u.email })),
      event,
    );
  } catch (err) {
    logger.error({ err, type: event.type }, "notification routing failed");
  }
}

// Department Managers (FR-005): active MANAGER users whose employee sits in that department.
export async function notifyDepartmentManagers(
  orgId: string,
  departmentId: string,
  event: NotificationEvent,
) {
  try {
    const managers = await listUsersByRole(orgId, ["MANAGER"]);
    const inDept: Recipient[] = [];
    for (const m of managers) {
      if (!m.employeeId) continue;
      const employee = await getEmployeeSummary(orgId, m.employeeId);
      if (employee?.departmentId === departmentId && employee.status === "ACTIVE") {
        inDept.push({ userId: m.id, employeeId: m.employeeId, email: m.email });
      }
    }
    await fanOut(orgId, inDept, event);
  } catch (err) {
    logger.error({ err, type: event.type }, "notification routing failed");
  }
}

// --- Notification center (User Story 2) ---

export async function listMyNotifications(
  orgId: string,
  userId: string,
  opts: { unreadOnly?: boolean; before?: string; limit?: number } = {},
) {
  const [items, unreadCount] = await Promise.all([
    repo.listForUser(orgId, userId, {
      unreadOnly: opts.unreadOnly,
      before: opts.before ? new Date(opts.before) : undefined,
      limit: opts.limit ?? 30,
    }),
    repo.countUnread(orgId, userId),
  ]);
  return { items, unreadCount };
}

export async function getUnreadCount(orgId: string, userId: string) {
  return { unreadCount: await repo.countUnread(orgId, userId) };
}

export async function markRead(orgId: string, userId: string, id: string) {
  const { count } = await repo.markRead(orgId, userId, id);
  // Another user's id looks exactly like a missing one, so existence never leaks.
  if (count === 0) throw new DomainError("NOT_FOUND", "Notification not found.", 404);
  return getUnreadCount(orgId, userId);
}

export async function markAllRead(orgId: string, userId: string) {
  await repo.markAllRead(orgId, userId);
  return { unreadCount: 0 };
}
