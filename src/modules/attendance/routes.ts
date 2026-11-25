import { Router } from "express";
import { z } from "zod";
import { registry, bearerAuth } from "../../lib/openapi.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./controller.js";
import {
  CreateLeaveRequestSchema,
  CreateLeaveRequestResponseSchema,
  LeaveRequestSchema,
  LeaveRequestListResponseSchema,
  RejectLeaveRequestSchema,
  LeaveBalanceListResponseSchema,
  LeaveTypeSchema,
  CreateLeaveTypeRequestSchema,
  HolidaySchema,
  CreateHolidayRequestSchema,
  AttendanceRecordSchema,
  AttendanceHistoryResponseSchema,
} from "./schema.js";

// Declares this module's endpoints, attaches auth + RBAC middleware, and
// delegates to controller.ts. See specs/003-attendance-leave/spec.md and
// contracts/attendance-leave-api.md for requirements.
export const attendanceRouter = Router();

attendanceRouter.post("/check-in", authenticate, (req, res, next) => {
  controller.checkIn(req, res).catch(next);
});

attendanceRouter.post("/check-out", authenticate, (req, res, next) => {
  controller.checkOut(req, res).catch(next);
});

// Breaks while checked in (time on a break isn't worked time).
attendanceRouter.post("/break/start", authenticate, (req, res, next) => {
  controller.startBreak(req, res).catch(next);
});

attendanceRouter.post("/break/end", authenticate, (req, res, next) => {
  controller.endBreak(req, res).catch(next);
});

// Today's state (OUT / WORKING / ON_BREAK), sessions and live totals.
attendanceRouter.get("/today", authenticate, (req, res, next) => {
  controller.getToday(req, res).catch(next);
});

attendanceRouter.get("/me", authenticate, (req, res, next) => {
  controller.getMyAttendance(req, res).catch(next);
});

export const leaveRequestRouter = Router();

leaveRequestRouter.post(
  "/",
  authenticate,
  validate(CreateLeaveRequestSchema),
  (req, res, next) => {
    controller.createLeaveRequest(req, res).catch(next);
  },
);

leaveRequestRouter.get("/me", authenticate, (req, res, next) => {
  controller.getMyLeaveRequests(req, res).catch(next);
});

leaveRequestRouter.get("/queue", authenticate, authorize("MANAGER", "HR", "ADMIN"), (req, res, next) => {
  controller.getApprovalQueue(req, res).catch(next);
});

leaveRequestRouter.post(
  "/:id/approve",
  authenticate,
  authorize("MANAGER", "HR", "ADMIN"),
  (req, res, next) => {
    controller.approveLeaveRequest(req, res).catch(next);
  },
);

leaveRequestRouter.post(
  "/:id/reject",
  authenticate,
  authorize("MANAGER", "HR", "ADMIN"),
  validate(RejectLeaveRequestSchema),
  (req, res, next) => {
    controller.rejectLeaveRequest(req, res).catch(next);
  },
);

export const leaveBalanceRouter = Router();

leaveBalanceRouter.get("/me", authenticate, (req, res, next) => {
  controller.getMyLeaveBalances(req, res).catch(next);
});

export const leaveTypeRouter = Router();

leaveTypeRouter.get("/", authenticate, (req, res, next) => {
  controller.listLeaveTypes(req, res).catch(next);
});

leaveTypeRouter.post(
  "/",
  authenticate,
  authorize("ADMIN", "HR"),
  validate(CreateLeaveTypeRequestSchema),
  (req, res, next) => {
    controller.createLeaveType(req, res).catch(next);
  },
);

export const holidayRouter = Router();

holidayRouter.get("/", authenticate, (req, res, next) => {
  controller.listHolidays(req, res).catch(next);
});

holidayRouter.post(
  "/",
  authenticate,
  authorize("ADMIN", "HR"),
  validate(CreateHolidayRequestSchema),
  (req, res, next) => {
    controller.createHoliday(req, res).catch(next);
  },
);

registry.registerPath({
  method: "post",
  path: "/attendance/check-in",
  tags: ["Attendance & Leave"],
  description: "Check in (start a work session). Allowed again after checking out; 409 ALREADY_CHECKED_IN while checked in, ON_BREAK while on a break.",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    201: { description: "Checked in.", content: { "application/json": { schema: AttendanceRecordSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/attendance/check-out",
  tags: ["Attendance & Leave"],
  description: "Check out (close the open work or break session). 409 NOT_CHECKED_IN.",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: { description: "Checked out.", content: { "application/json": { schema: AttendanceRecordSchema } } },
  },
});

for (const [path, description] of [
  ["/attendance/break/start", "Start a break while checked in (break time isn't worked time). 409 NOT_CHECKED_IN / ALREADY_ON_BREAK."],
  ["/attendance/break/end", "End the current break and continue working. 409 NOT_ON_BREAK."],
] as const) {
  registry.registerPath({
    method: "post",
    path,
    tags: ["Attendance & Leave"],
    description,
    security: [{ [bearerAuth.name]: [] }],
    responses: { 200: { description: "Today's attendance.", content: { "application/json": { schema: AttendanceRecordSchema } } } },
  });
}

registry.registerPath({
  method: "get",
  path: "/attendance/today",
  tags: ["Attendance & Leave"],
  description: "Today's state (OUT, WORKING, ON_BREAK), sessions and live worked/break minutes. The day resets at midnight India time; an open session is closed at 23:59:59.",
  security: [{ [bearerAuth.name]: [] }],
  responses: { 200: { description: "Today.", content: { "application/json": { schema: AttendanceRecordSchema } } } },
});

registry.registerPath({
  method: "get",
  path: "/attendance/me",
  tags: ["Attendance & Leave"],
  description: "The caller's own attendance history for a date range (defaults to the current month).",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: z.object({ from: z.string().optional(), to: z.string().optional() }) },
  responses: {
    200: { description: "History.", content: { "application/json": { schema: AttendanceHistoryResponseSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/leave-requests",
  tags: ["Attendance & Leave"],
  description: "File a leave request.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: CreateLeaveRequestSchema } } } },
  responses: {
    201: { description: "Created.", content: { "application/json": { schema: CreateLeaveRequestResponseSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/leave-requests/me",
  tags: ["Attendance & Leave"],
  description: "The caller's own leave requests, all statuses.",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: { description: "Requests.", content: { "application/json": { schema: LeaveRequestListResponseSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/leave-requests/queue",
  tags: ["Attendance & Leave"],
  description: "Pending leave requests for the caller to decide on. Manager/HR/Admin only.",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: { description: "Queue.", content: { "application/json": { schema: LeaveRequestListResponseSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/leave-requests/{id}/approve",
  tags: ["Attendance & Leave"],
  description: "Approve a pending leave request. Manager/HR/Admin only, never the requester themself.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Approved.", content: { "application/json": { schema: LeaveRequestSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/leave-requests/{id}/reject",
  tags: ["Attendance & Leave"],
  description: "Reject a pending leave request with a reason. Manager/HR/Admin only, never the requester themself.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: RejectLeaveRequestSchema } } },
  },
  responses: {
    200: { description: "Rejected.", content: { "application/json": { schema: LeaveRequestSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/leave-balances/me",
  tags: ["Attendance & Leave"],
  description: "The caller's own leave balances per type for a year (defaults to current year).",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: z.object({ year: z.string().optional() }) },
  responses: {
    200: { description: "Balances.", content: { "application/json": { schema: LeaveBalanceListResponseSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/leave-types",
  tags: ["Attendance & Leave"],
  description: "List leave types.",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: { description: "Leave types.", content: { "application/json": { schema: z.array(LeaveTypeSchema) } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/leave-types",
  tags: ["Attendance & Leave"],
  description: "Create a leave type. Admin/HR only.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: CreateLeaveTypeRequestSchema } } } },
  responses: {
    201: { description: "Created.", content: { "application/json": { schema: LeaveTypeSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/holidays",
  tags: ["Attendance & Leave"],
  description: "List company holidays.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: z.object({ year: z.string().optional() }) },
  responses: {
    200: { description: "Holidays.", content: { "application/json": { schema: z.array(HolidaySchema) } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/holidays",
  tags: ["Attendance & Leave"],
  description: "Add a company holiday. Admin/HR only.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: CreateHolidayRequestSchema } } } },
  responses: {
    201: { description: "Created.", content: { "application/json": { schema: HolidaySchema } } },
  },
});
