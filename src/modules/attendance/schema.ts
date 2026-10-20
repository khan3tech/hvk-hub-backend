import { z } from "zod";

// Request/response validation for the attendance module.
// See specs/003-attendance-leave/spec.md for the functional requirements.
export const AttendanceStatusSchema = z.enum(["PRESENT", "ABSENT", "ON_LEAVE", "HOLIDAY"]);
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

export const AttendanceRecordSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  date: z.string().date(),
  checkIn: z.string().datetime().nullable(),
  checkOut: z.string().datetime().nullable(),
  status: AttendanceStatusSchema,
});
export type AttendanceRecord = z.infer<typeof AttendanceRecordSchema>;

export const LeaveRequestStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);
export type LeaveRequestStatus = z.infer<typeof LeaveRequestStatusSchema>;

export const CreateLeaveRequestSchema = z.object({
  leaveTypeId: z.string(),
  startDate: z.string().date(),
  endDate: z.string().date(),
  // HR/Admin only (enforced in service.ts): records after-the-fact leave for another
  // employee, per spec Edge Cases — "allowed only for HR/Admin to record after-the-fact
  // leave, not for a self-service Employee request." Ignored (and rejected with 403 if
  // present) for a self-service caller.
  employeeId: z.string().optional(),
});
export type CreateLeaveRequest = z.infer<typeof CreateLeaveRequestSchema>;

export const LeaveRequestSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  leaveTypeId: z.string(),
  startDate: z.string().date(),
  endDate: z.string().date(),
  days: z.number().positive(),
  status: LeaveRequestStatusSchema,
  approverId: z.string().nullable(),
  rejectionReason: z.string().nullable().optional(),
});
export type LeaveRequest = z.infer<typeof LeaveRequestSchema>;

export const RejectLeaveRequestSchema = z.object({
  reason: z.string().min(1),
});
export type RejectLeaveRequest = z.infer<typeof RejectLeaveRequestSchema>;

export const LeaveTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  isPaid: z.boolean(),
  defaultDays: z.number().nonnegative(),
});
export type LeaveType = z.infer<typeof LeaveTypeSchema>;

export const LeaveBalanceSchema = z.object({
  employeeId: z.string(),
  leaveTypeId: z.string(),
  year: z.number().int(),
  allocated: z.number().nonnegative(),
  used: z.number().nonnegative(),
});
export type LeaveBalance = z.infer<typeof LeaveBalanceSchema>;

export const HolidaySchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string().date(),
  region: z.string().nullable().optional(),
});
export type Holiday = z.infer<typeof HolidaySchema>;

export const AttendanceHistoryResponseSchema = z.array(AttendanceRecordSchema);

export const CreateLeaveRequestResponseSchema = LeaveRequestSchema.extend({
  overlaps: z.object({
    holidays: z.array(HolidaySchema),
    approvedLeave: z.array(LeaveRequestSchema),
  }),
});
export type CreateLeaveRequestResponse = z.infer<typeof CreateLeaveRequestResponseSchema>;

export const LeaveRequestListResponseSchema = z.array(LeaveRequestSchema);

export const LeaveBalanceListResponseSchema = z.array(LeaveBalanceSchema);

export const CreateLeaveTypeRequestSchema = z.object({
  name: z.string().min(1),
  isPaid: z.boolean(),
  defaultDays: z.number().nonnegative(),
});
export type CreateLeaveTypeRequest = z.infer<typeof CreateLeaveTypeRequestSchema>;

export const CreateHolidayRequestSchema = z.object({
  name: z.string().min(1),
  date: z.string().date(),
  region: z.string().optional(),
});
export type CreateHolidayRequest = z.infer<typeof CreateHolidayRequestSchema>;
