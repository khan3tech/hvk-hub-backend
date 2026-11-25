// Prisma queries only — this is the one place in the attendance module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
// See specs/003-attendance-leave/spec.md → Key Entities for the data this module owns.
import moment from "moment";
import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "@prisma/client";

export function findAttendanceByDay(orgId: string, employeeId: string, date: Date) {
  return prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date } },
  });
}

export function createAttendance(data: Prisma.AttendanceUncheckedCreateInput) {
  return prisma.attendance.create({ data });
}

export function updateAttendance(id: string, data: Prisma.AttendanceUncheckedUpdateInput) {
  return prisma.attendance.update({ where: { id }, data });
}

export function upsertAttendance(params: {
  orgId: string;
  employeeId: string;
  date: Date;
  data: Prisma.AttendanceUncheckedUpdateInput & Prisma.AttendanceUncheckedCreateInput;
}) {
  return prisma.attendance.upsert({
    where: { employeeId_date: { employeeId: params.employeeId, date: params.date } },
    create: params.data,
    update: params.data,
  });
}

export function findAttendanceRange(orgId: string, employeeId: string, from: Date, to: Date) {
  return prisma.attendance.findMany({
    where: { orgId, employeeId, date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  });
}

export function findHolidaysInRange(orgId: string, from: Date, to: Date) {
  return prisma.holiday.findMany({ where: { orgId, date: { gte: from, lte: to } } });
}

export function findApprovedLeaveInRange(orgId: string, employeeId: string, from: Date, to: Date) {
  return prisma.leaveRequest.findMany({
    where: {
      orgId,
      employeeId,
      status: "APPROVED",
      startDate: { lte: to },
      endDate: { gte: from },
    },
  });
}

// 004-payroll research.md R2: approved leave under an unpaid LeaveType, overlapping a payroll
// period. Joins leaveType so the caller can filter/trust `isPaid` without a second query.
export function findApprovedUnpaidLeaveInRange(orgId: string, employeeId: string, from: Date, to: Date) {
  return prisma.leaveRequest.findMany({
    where: {
      orgId,
      employeeId,
      status: "APPROVED",
      startDate: { lte: to },
      endDate: { gte: from },
      leaveType: { isPaid: false },
    },
  });
}

export function createLeaveRequest(data: Prisma.LeaveRequestUncheckedCreateInput) {
  return prisma.leaveRequest.create({ data });
}

export function findLeaveRequestById(orgId: string, id: string) {
  return prisma.leaveRequest.findFirst({ where: { id, orgId } });
}

export function updateLeaveRequest(id: string, data: Prisma.LeaveRequestUncheckedUpdateInput) {
  return prisma.leaveRequest.update({ where: { id }, data });
}

export function findLeaveRequestsByEmployee(orgId: string, employeeId: string) {
  return prisma.leaveRequest.findMany({
    where: { orgId, employeeId },
    orderBy: { createdAt: "desc" },
  });
}

export function findPendingLeaveForEmployees(orgId: string, employeeIds: string[]) {
  return prisma.leaveRequest.findMany({
    where: { orgId, status: "PENDING", employeeId: { in: employeeIds } },
    orderBy: { createdAt: "asc" },
  });
}

export function findPendingLeaveOrgWide(orgId: string) {
  return prisma.leaveRequest.findMany({
    where: { orgId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
}

export function findLeaveBalance(orgId: string, employeeId: string, leaveTypeId: string, year: number) {
  return prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
  });
}

export function findLeaveBalancesForEmployee(orgId: string, employeeId: string, year: number) {
  return prisma.leaveBalance.findMany({ where: { orgId, employeeId, year } });
}

export function createLeaveBalance(data: Prisma.LeaveBalanceUncheckedCreateInput) {
  return prisma.leaveBalance.create({ data });
}

export function updateLeaveBalance(id: string, data: Prisma.LeaveBalanceUncheckedUpdateInput) {
  return prisma.leaveBalance.update({ where: { id }, data });
}

export function findLeaveTypes(orgId: string) {
  return prisma.leaveType.findMany({ where: { orgId } });
}

export function findLeaveTypeById(orgId: string, id: string) {
  return prisma.leaveType.findFirst({ where: { id, orgId } });
}

export function createLeaveType(data: Prisma.LeaveTypeUncheckedCreateInput) {
  return prisma.leaveType.create({ data });
}

export function findHolidays(orgId: string, year?: number) {
  if (year) {
    return prisma.holiday.findMany({
      where: { orgId, date: { gte: moment.utc(`${year}-01-01`).toDate(), lte: moment.utc(`${year}-12-31`).toDate() } },
      orderBy: { date: "asc" },
    });
  }
  return prisma.holiday.findMany({ where: { orgId }, orderBy: { date: "asc" } });
}

export function createHoliday(data: Prisma.HolidayUncheckedCreateInput) {
  return prisma.holiday.create({ data });
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

// 011 analytics: approved leave starting within [from, to].
export function findApprovedLeaveStartingIn(orgId: string, from: Date, to: Date) {
  return prisma.leaveRequest.findMany({
    where: { orgId, status: "APPROVED", startDate: { gte: from, lte: to } },
    select: { employeeId: true, leaveTypeId: true, days: true, startDate: true },
  });
}

// --- Attendance sessions (multiple check-ins and breaks per day) ---

export type Tx = Prisma.TransactionClient;

export function transaction<T>(fn: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(fn);
}

export function findOpenSession(employeeId: string, tx?: Tx) {
  return (tx ?? prisma).attendanceSession.findFirst({
    where: { employeeId, checkOut: null },
    include: { attendance: { select: { id: true, date: true } } },
  });
}

export function listOpenSessionsBefore(day: Date) {
  return prisma.attendanceSession.findMany({
    where: { checkOut: null, attendance: { date: { lt: day } } },
    include: { attendance: { select: { id: true, date: true } } },
  });
}

export function createSession(tx: Tx, data: Prisma.AttendanceSessionUncheckedCreateInput) {
  return tx.attendanceSession.create({ data });
}

export function closeSession(tx: Tx, id: string, checkOut: Date, autoClosed = false) {
  return tx.attendanceSession.update({ where: { id }, data: { checkOut, autoClosed } });
}

export function upsertDay(tx: Tx, orgId: string, employeeId: string, date: Date) {
  return tx.attendance.upsert({
    where: { employeeId_date: { employeeId, date } },
    create: { orgId, employeeId, date, status: "PRESENT" },
    update: {},
  });
}

export function updateDay(tx: Tx, id: string, data: Prisma.AttendanceUncheckedUpdateInput) {
  return tx.attendance.update({ where: { id }, data });
}

export function findDayWithSessions(employeeId: string, date: Date) {
  return prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date } },
    include: { sessions: { orderBy: { checkIn: "asc" } } },
  });
}

export function findAttendanceRangeWithSessions(orgId: string, employeeId: string, from: Date, to: Date) {
  return prisma.attendance.findMany({
    where: { orgId, employeeId, date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
    include: { sessions: { orderBy: { checkIn: "asc" } } },
  });
}
