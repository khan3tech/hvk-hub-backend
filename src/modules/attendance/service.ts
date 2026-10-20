// Business rules for the attendance module. Framework-agnostic — no req/res.
// Calls repository.ts for persistence; never imports Prisma directly.
// Implements the functional requirements (FR-xxx) in specs/003-attendance-leave/spec.md.
import moment from "moment";
import { DomainError } from "../../middleware/errorHandler.js";
import { getTeamView } from "../employee/service.js";
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

export async function checkIn(orgId: string, employeeId: string) {
  const today = todayUtc();
  const existing = await repo.findAttendanceByDay(orgId, employeeId, today);
  if (existing?.checkIn) {
    throw new DomainError("ALREADY_CHECKED_IN", "You've already checked in today.", 409);
  }

  return repo.upsertAttendance({
    orgId,
    employeeId,
    date: today,
    data: { orgId, employeeId, date: today, checkIn: moment().toDate() },
  });
}

export async function checkOut(orgId: string, employeeId: string) {
  const today = todayUtc();
  const existing = await repo.findAttendanceByDay(orgId, employeeId, today);
  if (!existing?.checkIn) {
    throw new DomainError("NOT_CHECKED_IN", "You need to check in before checking out.", 409);
  }
  if (existing.checkOut) {
    throw new DomainError("ALREADY_CHECKED_OUT", "You've already checked out today.", 409);
  }

  return repo.updateAttendance(existing.id, { checkOut: moment().toDate(), status: "PRESENT" });
}

export async function getAttendanceHistory(
  orgId: string,
  employeeId: string,
  from?: string,
  to?: string,
) {
  const rangeStart = from ? startOfDay(from) : moment.utc().startOf("month").toDate();
  const rangeEnd = to ? startOfDay(to) : todayUtc();

  const records = await repo.findAttendanceRange(orgId, employeeId, rangeStart, rangeEnd);
  const byDate = new Map(records.map((r) => [dateKey(r.date), r]));

  const result = [];
  const cursor = moment.utc(rangeStart);
  const end = moment.utc(rangeEnd);
  while (cursor.isSameOrBefore(end)) {
    const key = cursor.format("YYYY-MM-DD");
    const record = byDate.get(key);
    result.push(
      record
        ? { id: record.id, employeeId, date: key, checkIn: record.checkIn, checkOut: record.checkOut, status: record.status }
        : { id: `synthetic-${key}`, employeeId, date: key, checkIn: null, checkOut: null, status: "ABSENT" as const },
    );
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
