// Parses/validates the request (via schema.ts + the validate middleware),
// calls one or more services, and shapes the HTTP response. No business
// logic here — see specs/003-attendance-leave/spec.md for what this module must do.
import type { Request, Response } from "express";
import { orgOf } from "../../lib/tenant.js";
import { DomainError } from "../../middleware/errorHandler.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as attendanceService from "./service.js";

function getOrgId(req: Request): string {
  return orgOf(req);
}

function requireEmployeeId(actor: AccessTokenPayload): string {
  if (!actor.employeeId) {
    throw new DomainError("FORBIDDEN", "This action requires a linked employee record.", 403);
  }
  return actor.employeeId;
}

// --- Attendance ---

export async function checkIn(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const result = await attendanceService.checkIn(getOrgId(req), requireEmployeeId(actor));
  res.status(201).json(result);
}

export async function checkOut(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const result = await attendanceService.checkOut(getOrgId(req), requireEmployeeId(actor));
  res.json(result);
}

export async function getMyAttendance(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const { from, to } = req.query as Record<string, string | undefined>;
  const result = await attendanceService.getAttendanceHistory(getOrgId(req), requireEmployeeId(actor), from, to);
  res.json(result);
}

// --- Leave requests & balances ---

export async function createLeaveRequest(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const result = await attendanceService.createLeaveRequest(
    getOrgId(req),
    requireEmployeeId(actor),
    req.body,
    actor,
  );
  res.status(201).json(result);
}

export async function getMyLeaveRequests(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const result = await attendanceService.getMyLeaveRequests(getOrgId(req), requireEmployeeId(actor));
  res.json(result);
}

export async function getMyLeaveBalances(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const { year } = req.query as Record<string, string | undefined>;
  const result = await attendanceService.getMyLeaveBalances(
    getOrgId(req),
    requireEmployeeId(actor),
    year ? Number(year) : undefined,
  );
  res.json(result);
}

// --- Approval workflow ---

export async function getApprovalQueue(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const result = await attendanceService.getApprovalQueue(getOrgId(req), actor);
  res.json(result);
}

export async function approveLeaveRequest(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const { id } = req.params;
  if (!id) throw new DomainError("NOT_FOUND", "Leave request not found.", 404);
  const result = await attendanceService.approveLeaveRequest(getOrgId(req), id, actor);
  res.json(result);
}

export async function rejectLeaveRequest(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const { id } = req.params;
  if (!id) throw new DomainError("NOT_FOUND", "Leave request not found.", 404);
  const result = await attendanceService.rejectLeaveRequest(getOrgId(req), id, actor, req.body);
  res.json(result);
}

// --- Leave types & holidays ---

export async function listLeaveTypes(req: Request, res: Response): Promise<void> {
  const result = await attendanceService.listLeaveTypes(getOrgId(req));
  res.json(result);
}

export async function createLeaveType(req: Request, res: Response): Promise<void> {
  const result = await attendanceService.createLeaveType(getOrgId(req), req.body);
  res.status(201).json(result);
}

export async function listHolidays(req: Request, res: Response): Promise<void> {
  const { year } = req.query as Record<string, string | undefined>;
  const result = await attendanceService.listHolidays(getOrgId(req), year ? Number(year) : undefined);
  res.json(result);
}

export async function createHoliday(req: Request, res: Response): Promise<void> {
  const result = await attendanceService.createHoliday(getOrgId(req), req.body);
  res.status(201).json(result);
}
