// Business rules for the attendance module. Framework-agnostic — no req/res.
// Calls repository.ts for persistence; never imports Prisma directly.
// Implements the functional requirements (FR-xxx) in specs/003-attendance-leave/spec.md.
import moment from "moment";
import { DomainError } from "../../middleware/errorHandler.js";
import { getEmployeeSummary, getTeamView } from "../employee/service.js";
import { notifyEmployees } from "../notifications/service.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import type { CreateLeaveRequest, RejectLeaveRequest } from "./schema.js";

function startOfDay(date: moment.MomentInput): Date {
  return moment.utc(date).startOf("day").toDate();
}

function todayUtc(): Date {
  return moment.utc().startOf("day").toDate();
}

function dateKey(date: moment.MomentInput): string {
  return moment.utc(date).format("YYYY-MM-DD");
}

// research.md R1: only Mon-Fri, non-holiday days count against the balance. Used identically
// at request-time (FR-007) and approval-time (FR-010) so the two counts can never disagree.
async function countWorkingDays(orgId: string, startDate: Date, endDate: Date): Promise<number> {
  const holidays = await repo.findHolidaysInRange(orgId, startDate, endDate);
  const holidayKeys = new Set(holidays.map((h) => dateKey(h.date)));

  let count = 0;
  const cursor = moment.utc(startDate);
  const end = moment.utc(endDate);
  while (cursor.isSameOrBefore(end)) {
    const day = cursor.day(); // 0=Sun..6=Sat
    if (day !== 0 && day !== 6 && !holidayKeys.has(cursor.format("YYYY-MM-DD"))) {
      count++;
    }
    cursor.add(1, "day");
  }
  return count;
}

// 004-payroll research.md R2: sum of approved, unpaid-leave-type working days for one employee
// that overlap a payroll period, clipped to the period's own bounds. Reuses this module's own
// weekday/holiday-exclusion logic (countWorkingDays) so payroll charges the same notion of
// "day" 003 already established for leave balances — never re-derives it independently.
export async function getUnpaidLeaveDaysForPeriod(
  orgId: string,
  employeeId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const unpaidLeave = await repo.findApprovedUnpaidLeaveInRange(orgId, employeeId, periodStart, periodEnd);

  let total = 0;
  for (const leave of unpaidLeave) {
    const clippedStart = moment.max(moment.utc(leave.startDate), moment.utc(periodStart)).toDate();
    const clippedEnd = moment.min(moment.utc(leave.endDate), moment.utc(periodEnd)).toDate();
    if (moment.utc(clippedStart).isAfter(clippedEnd)) continue;
    total += await countWorkingDays(orgId, clippedStart, clippedEnd);
  }
  return total;
}

// research.md R2: non-blocking, informational only — surfaced in the create response, never
// rejects the request itself (FR-006 "flags the overlap before submission").
async function checkOverlap(orgId: string, employeeId: string, startDate: Date, endDate: Date) {
  const [holidays, approvedLeave] = await Promise.all([
    repo.findHolidaysInRange(orgId, startDate, endDate),
    repo.findApprovedLeaveInRange(orgId, employeeId, startDate, endDate),
  ]);
  return { holidays, approvedLeave };
}

async function logActivity(params: {
  orgId: string;
  actorEmployeeId: string | null;
  action: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}) {
  if (!params.actorEmployeeId) return;
  await repo.writeActivityLog({
    orgId: params.orgId,
    actorId: params.actorEmployeeId,
    action: params.action,
    entity: "LeaveRequest",
    entityId: params.entityId,
    before: params.before,
    after: params.after,
  });
}

// --- Attendance (User Story 1) ---
// Multiple check-ins per day with breaks. A day is the org-local calendar day (India time), so it
// resets at midnight there, not at 00:00 UTC. Each stretch is an AttendanceSession: WORK while
// checked in, BREAK while on a break. At most one is open per employee (DB-enforced); one still
// open when its day ends is closed at 23:59:59 that day (closeStaleSessions, or lazily on next use).

const ORG_UTC_OFFSET_MIN = 330; // Asia/Kolkata, no DST
const MINUTE = 60_000;

// The org-local calendar date as the UTC-midnight Date Postgres stores in a @db.Date column.
function todayLocal(now = new Date()): Date {
  return moment.utc(moment(now).utcOffset(ORG_UTC_OFFSET_MIN).format("YYYY-MM-DD")).toDate();
}

// 23:59:59.999 org-local on `day` (a UTC-midnight date), as a UTC instant.
function endOfLocalDay(day: Date): Date {
  return new Date(day.getTime() + 24 * 60 * MINUTE - ORG_UTC_OFFSET_MIN * MINUTE - 1);
}

const minutesBetween = (from: Date, to: Date) => Math.max(0, Math.round((to.getTime() - from.getTime()) / MINUTE));

export type AttendanceState = "OUT" | "WORKING" | "ON_BREAK";

type DayWithSessions = NonNullable<Awaited<ReturnType<typeof repo.findDayWithSessions>>>;

function presentDay(day: DayWithSessions | null, employeeId: string, date: Date, now = new Date()) {
  const sessions = day?.sessions ?? [];
  const open = sessions.find((x) => !x.checkOut);
  const state: AttendanceState = !open ? "OUT" : open.kind === "BREAK" ? "ON_BREAK" : "WORKING";
  // Live totals include the open session up to now.
  const live = (kind: "WORK" | "BREAK") =>
    sessions.filter((x) => x.kind === kind).reduce((sum, x) => sum + minutesBetween(x.checkIn, x.checkOut ?? now), 0);
  return {
    id: day?.id ?? `synthetic-${dateKey(date)}`,
    employeeId,
    date: dateKey(date),
    checkIn: day?.checkIn ?? null,
    checkOut: day?.checkOut ?? null,
    status: day?.status ?? ("ABSENT" as const),
    state,
    workedMinutes: day ? live("WORK") : 0,
    breakMinutes: day ? live("BREAK") : 0,
    sessions: sessions.map((x) => ({ id: x.id, kind: x.kind, checkIn: x.checkIn, checkOut: x.checkOut, autoClosed: x.autoClosed })),
  };
}

type OpenSession = { id: string; kind: "WORK" | "BREAK"; checkIn: Date; attendance: { id: string; date: Date } };

// Closes a session and adds its minutes to the day's totals; the close time is the day's latest
// check-out.
async function closeAndTotal(tx: repo.Tx, session: OpenSession, at: Date, autoClosed = false) {
  await repo.closeSession(tx, session.id, at, autoClosed);
  const minutes = minutesBetween(session.checkIn, at);
  await repo.updateDay(tx, session.attendance.id, {
    ...(session.kind === "WORK" ? { workedMinutes: { increment: minutes } } : { breakMinutes: { increment: minutes } }),
    checkOut: at,
  });
}

// End-of-day reset: a session left open on an earlier day is closed at 23:59:59 of its own day.
async function closeStaleFor(employeeId: string, today: Date) {
  const open = await repo.findOpenSession(employeeId);
  if (open && open.attendance.date < today) {
    await repo.transaction((tx) => closeAndTotal(tx, open, endOfLocalDay(open.attendance.date), true));
  }
}

export async function closeStaleSessions(now = new Date()) {
  const today = todayLocal(now);
  const stale = await repo.listOpenSessionsBefore(today);
  for (const s of stale) {
    await repo.transaction((tx) => closeAndTotal(tx, s, endOfLocalDay(s.attendance.date), true));
  }
  return stale.length;
}

async function todayView(employeeId: string) {
  const date = todayLocal();
  return presentDay(await repo.findDayWithSessions(employeeId, date), employeeId, date);
}

export async function getTodayAttendance(orgId: string, employeeId: string) {
  await closeStaleFor(employeeId, todayLocal());
  return todayView(employeeId);
}

// For other modules (029 activity tracking runs only while the employee is checked in and working).
export async function getAttendanceState(employeeId: string): Promise<AttendanceState> {
  const open = await repo.findOpenSession(employeeId);
  if (!open || open.attendance.date < todayLocal()) return "OUT";
  return open.kind === "BREAK" ? "ON_BREAK" : "WORKING";
}

// A unique-index violation means a concurrent request already opened a session.
function isOpenSessionConflict(err: unknown) {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

export async function checkIn(orgId: string, employeeId: string) {
  const date = todayLocal();
  await closeStaleFor(employeeId, date);
  const now = moment().toDate();
  try {
    await repo.transaction(async (tx) => {
      const open = await repo.findOpenSession(employeeId, tx);
      if (open?.kind === "BREAK") throw new DomainError("ON_BREAK", "You're on a break. End your break to continue working.", 409);
      if (open) throw new DomainError("ALREADY_CHECKED_IN", "You're already checked in.", 409);
      const day = await repo.upsertDay(tx, orgId, employeeId, date);
      await repo.updateDay(tx, day.id, { checkIn: day.checkIn ?? now, checkOut: null, status: "PRESENT" });
      await repo.createSession(tx, { orgId, employeeId, attendanceId: day.id, kind: "WORK", checkIn: now });
    });
  } catch (err) {
    if (isOpenSessionConflict(err)) throw new DomainError("ALREADY_CHECKED_IN", "You're already checked in.", 409);
    throw err;
  }
  return todayView(employeeId);
}

export async function checkOut(orgId: string, employeeId: string) {
  await closeStaleFor(employeeId, todayLocal());
  await repo.transaction(async (tx) => {
    const open = await repo.findOpenSession(employeeId, tx);
    if (!open) throw new DomainError("NOT_CHECKED_IN", "You need to check in before checking out.", 409);
    await closeAndTotal(tx, open, moment().toDate());
  });
  return todayView(employeeId);
}

async function switchSession(orgId: string, employeeId: string, from: "WORK" | "BREAK") {
  await closeStaleFor(employeeId, todayLocal());
  try {
    await repo.transaction(async (tx) => {
      const open = await repo.findOpenSession(employeeId, tx);
      if (from === "WORK") {
        if (!open) throw new DomainError("NOT_CHECKED_IN", "Check in before starting a break.", 409);
        if (open.kind === "BREAK") throw new DomainError("ALREADY_ON_BREAK", "You're already on a break.", 409);
      } else if (!open || open.kind !== "BREAK") {
        throw new DomainError("NOT_ON_BREAK", "You're not on a break.", 409);
      }
      const now = moment().toDate();
      await closeAndTotal(tx, open, now);
      await repo.updateDay(tx, open.attendance.id, { checkOut: null }); // still checked in
      await repo.createSession(tx, { orgId, employeeId, attendanceId: open.attendance.id, kind: from === "WORK" ? "BREAK" : "WORK", checkIn: now });
    });
  } catch (err) {
    if (isOpenSessionConflict(err)) throw new DomainError("CONFLICT", "That was already done. Refresh to see the latest.", 409);
    throw err;
  }
  return todayView(employeeId);
}

export const startBreak = (orgId: string, employeeId: string) => switchSession(orgId, employeeId, "WORK");
export const endBreak = (orgId: string, employeeId: string) => switchSession(orgId, employeeId, "BREAK");

export async function getAttendanceHistory(
  orgId: string,
  employeeId: string,
  from?: string,
  to?: string,
) {
  const rangeStart = from ? startOfDay(from) : moment.utc(todayLocal()).startOf("month").toDate();
  const rangeEnd = to ? startOfDay(to) : todayLocal();

  await closeStaleFor(employeeId, todayLocal());
  const records = await repo.findAttendanceRangeWithSessions(orgId, employeeId, rangeStart, rangeEnd);
  const byDate = new Map(records.map((r) => [dateKey(r.date), r]));

  const result = [];
  const cursor = moment.utc(rangeStart);
  const end = moment.utc(rangeEnd);
  while (cursor.isSameOrBefore(end)) {
    const key = cursor.format("YYYY-MM-DD");
    result.push(presentDay(byDate.get(key) ?? null, employeeId, cursor.toDate()));
    cursor.add(1, "day");
  }
  return result;
}

// --- Leave balances & requests (User Story 2) ---

async function getOrCreateLeaveBalance(orgId: string, employeeId: string, leaveTypeId: string, year: number) {
  const existing = await repo.findLeaveBalance(orgId, employeeId, leaveTypeId, year);
  if (existing) return existing;

  const leaveType = await repo.findLeaveTypeById(orgId, leaveTypeId);
  if (!leaveType) {
    throw new DomainError("VALIDATION_ERROR", "Leave type not found.", 400);
  }

  return repo.createLeaveBalance({
    orgId,
    employeeId,
    leaveTypeId,
    year,
    allocated: leaveType.defaultDays,
    used: 0,
  });
}

export async function createLeaveRequest(
  orgId: string,
  callerEmployeeId: string,
  input: CreateLeaveRequest,
  actor: AccessTokenPayload,
) {
  const isPrivileged = actor.role === "ADMIN" || actor.role === "HR";

  // spec Edge Cases: recording leave for someone else is HR/Admin-only. A self-service caller
  // may only ever create a request for themself — reject outright if they try to set employeeId.
  if (input.employeeId && input.employeeId !== callerEmployeeId && !isPrivileged) {
    throw new DomainError(
      "FORBIDDEN",
      "You can only file a leave request for yourself.",
      403,
    );
  }
  const employeeId = input.employeeId ?? callerEmployeeId;
  // 015 FR-003: HR filing on someone's behalf must name an employee of their own organization.
  if (employeeId !== callerEmployeeId && !(await getEmployeeSummary(orgId, employeeId))) {
    throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  }

  const startDate = startOfDay(input.startDate);
  const endDate = startOfDay(input.endDate);

  if (moment.utc(startDate).isAfter(endDate)) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "Start date must be on or before the end date.",
      400,
      { startDate: ["Must be on or before end date."] },
    );
  }

  // Past-date requests are HR/Admin-only regardless of whose behalf they're filing on
  // (spec Edge Cases — "allowed only for HR/Admin to record after-the-fact leave").
  if (!isPrivileged && moment.utc(startDate).isBefore(todayUtc())) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "Only HR or Admin can record leave for past dates.",
      400,
      { startDate: ["Cannot be in the past."] },
    );
  }

  const days = await countWorkingDays(orgId, startDate, endDate);
  const year = moment.utc(startDate).year();
  const balance = await getOrCreateLeaveBalance(orgId, employeeId, input.leaveTypeId, year);

  const remaining = balance.allocated - balance.used;
  if (days > remaining) {
    throw new DomainError(
      "INSUFFICIENT_BALANCE",
      `This request needs ${days} day(s) but only ${remaining} day(s) remain for this leave type.`,
      409,
    );
  }

  const request = await repo.createLeaveRequest({
    orgId,
    employeeId,
    leaveTypeId: input.leaveTypeId,
    startDate,
    endDate,
    days,
    status: "PENDING",
  });

  const overlaps = await checkOverlap(orgId, employeeId, startDate, endDate);

  // 006 FR-002: the requester's manager is prompted to review (in-app only).
  const requester = await getEmployeeSummary(orgId, employeeId);
  if (requester?.managerId) {
    await notifyEmployees(orgId, [requester.managerId], {
      type: "LEAVE_PENDING_APPROVAL",
      message: `${requester.name} requested leave ${dateKey(startDate)} to ${dateKey(endDate)} (${days} day(s)).`,
      link: `/leave/approvals/${request.id}`,
    });
  }

  return { ...request, overlaps };
}

export async function getMyLeaveRequests(orgId: string, employeeId: string) {
  return repo.findLeaveRequestsByEmployee(orgId, employeeId);
}

export async function getMyLeaveBalances(orgId: string, employeeId: string, year?: number) {
  const targetYear = year ?? moment.utc().year();
  const leaveTypes = await repo.findLeaveTypes(orgId);
  return Promise.all(
    leaveTypes.map((lt) => getOrCreateLeaveBalance(orgId, employeeId, lt.id, targetYear)),
  );
}

// --- Leave type & holiday lookups ---

export async function listLeaveTypes(orgId: string) {
  return repo.findLeaveTypes(orgId);
}

export async function createLeaveType(orgId: string, data: { name: string; isPaid: boolean; defaultDays: number }) {
  const existing = (await repo.findLeaveTypes(orgId)).find((lt) => lt.name === data.name);
  if (existing) {
    throw new DomainError("LEAVE_TYPE_EXISTS", "A leave type with this name already exists.", 409);
  }
  return repo.createLeaveType({ orgId, ...data });
}

export async function listHolidays(orgId: string, year?: number) {
  return repo.findHolidays(orgId, year);
}

export async function createHoliday(orgId: string, data: { name: string; date: string; region?: string }) {
  return repo.createHoliday({ orgId, name: data.name, date: startOfDay(data.date), region: data.region });
}

// --- Approval workflow (User Story 3) ---

export async function getApprovalQueue(orgId: string, requester: AccessTokenPayload) {
  if (requester.role === "HR" || requester.role === "ADMIN") {
    return repo.findPendingLeaveOrgWide(orgId);
  }

  // MANAGER: computed live from current reporting-line data (research.md R5) — never a
  // manager's own requests (research.md R3).
  const { directReports } = await getTeamView(orgId, requester);
  const reportIds = directReports.map((r) => r.id);
  if (reportIds.length === 0) return [];
  return repo.findPendingLeaveForEmployees(orgId, reportIds);
}

// 006 FR-001: the requester hears about the decision in-app and by email, with the dates and
// (on rejection) the reason.
async function notifyLeaveDecision(
  orgId: string,
  request: { id: string; employeeId: string; startDate: Date; endDate: Date },
  decision: "APPROVED" | "REJECTED",
  reason?: string,
) {
  const range = `${dateKey(request.startDate)} to ${dateKey(request.endDate)}`;
  const message =
    decision === "APPROVED"
      ? `Your leave for ${range} was approved.`
      : `Your leave for ${range} was rejected${reason ? `: ${reason}` : "."}`;
  await notifyEmployees(orgId, [request.employeeId], {
    type: "LEAVE_DECIDED",
    message,
    link: `/leave/requests/${request.id}`,
    email: { subject: `Leave request ${decision.toLowerCase()}`, text: message },
  });
}

async function decideLeaveRequest(
  orgId: string,
  id: string,
  decision: "APPROVED" | "REJECTED",
  actor: AccessTokenPayload,
  reason?: string,
) {
  const request = await repo.findLeaveRequestById(orgId, id);
  if (!request) {
    throw new DomainError("NOT_FOUND", "Leave request not found.", 404);
  }

  // research.md R4: unconditional — even HR/Admin cannot approve/reject their own request.
  if (request.employeeId === actor.employeeId) {
    throw new DomainError(
      "SELF_APPROVAL_FORBIDDEN",
      "You cannot decide on your own leave request.",
      403,
    );
  }

  // A Manager may only decide for their current direct reports — the same live reporting-line
  // check as getApprovalQueue (research.md R5), so a request id from outside the queue can't
  // be decided directly. HR/Admin decide org-wide.
  if (actor.role === "MANAGER") {
    const { directReports } = await getTeamView(orgId, actor);
    if (!directReports.some((r) => r.id === request.employeeId)) {
      throw new DomainError(
        "FORBIDDEN",
        "You can only decide on leave requests from your direct reports.",
        403,
      );
    }
  }

  if (request.status !== "PENDING") {
    throw new DomainError("ALREADY_DECIDED", "This request has already been decided.", 409);
  }

  if (decision === "APPROVED") {
    // Re-computed fresh rather than trusting the stored `days` (research.md R1) — guards
    // against the holiday calendar changing between request and decision.
    const days = await countWorkingDays(orgId, request.startDate, request.endDate);
    const year = moment.utc(request.startDate).year();
    const balance = await getOrCreateLeaveBalance(orgId, request.employeeId, request.leaveTypeId, year);

    await repo.updateLeaveBalance(balance.id, { used: balance.used + days });

    const cursor = moment.utc(request.startDate);
    const end = moment.utc(request.endDate);
    const holidays = await repo.findHolidaysInRange(orgId, request.startDate, request.endDate);
    const holidayKeys = new Set(holidays.map((h) => dateKey(h.date)));
    while (cursor.isSameOrBefore(end)) {
      const day = cursor.day();
      if (day !== 0 && day !== 6 && !holidayKeys.has(cursor.format("YYYY-MM-DD"))) {
        const cursorDate = cursor.toDate();
        await repo.upsertAttendance({
          orgId,
          employeeId: request.employeeId,
          date: cursorDate,
          data: { orgId, employeeId: request.employeeId, date: cursorDate, status: "ON_LEAVE" },
        });
      }
      cursor.add(1, "day");
    }

    const updated = await repo.updateLeaveRequest(id, {
      status: "APPROVED",
      approverId: actor.employeeId,
      decidedAt: moment().toDate(),
    });

    await logActivity({
      orgId,
      actorEmployeeId: actor.employeeId,
      action: "leave.approved",
      entityId: id,
      after: { status: "APPROVED", daysCharged: days },
    });

    await notifyLeaveDecision(orgId, request, "APPROVED");
    return updated;
  }

  // REJECTED
  const updated = await repo.updateLeaveRequest(id, {
    status: "REJECTED",
    approverId: actor.employeeId,
    decidedAt: moment().toDate(),
    rejectionReason: reason,
  });

  await logActivity({
    orgId,
    actorEmployeeId: actor.employeeId,
    action: "leave.rejected",
    entityId: id,
    after: { status: "REJECTED", reason },
  });

  await notifyLeaveDecision(orgId, request, "REJECTED", reason);
  return updated;
}

export async function approveLeaveRequest(orgId: string, id: string, actor: AccessTokenPayload) {
  return decideLeaveRequest(orgId, id, "APPROVED", actor);
}

export async function rejectLeaveRequest(
  orgId: string,
  id: string,
  actor: AccessTokenPayload,
  input: RejectLeaveRequest,
) {
  return decideLeaveRequest(orgId, id, "REJECTED", actor, input.reason);
}

// Bulk read for 011 analytics (leave usage). Requests are attributed to the period they start in.
export async function listApprovedLeaveForAnalytics(orgId: string, from: Date, to: Date) {
  return repo.findApprovedLeaveStartingIn(orgId, from, to);
}
