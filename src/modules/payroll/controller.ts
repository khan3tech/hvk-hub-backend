// Parses/validates the request (via schema.ts + the validate middleware),
// calls one or more services, and shapes the HTTP response. No business
// logic here — see specs/004-payroll/spec.md for what this module must do.
import type { Request, Response } from "express";
import { orgOf } from "../../lib/tenant.js";
import { DomainError } from "../../middleware/errorHandler.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as payrollService from "./service.js";

function getOrgId(req: Request): string {
  return orgOf(req);
}

function requireEmployeeId(actor: AccessTokenPayload): string {
  if (!actor.employeeId) {
    throw new DomainError("FORBIDDEN", "This action requires a linked employee record.", 403);
  }
  return actor.employeeId;
}

// --- Salary structures ---

export async function setSalaryStructure(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const { employeeId } = req.params;
  if (!employeeId) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  const result = await payrollService.setSalaryStructure(getOrgId(req), employeeId, req.body, actor);
  res.status(201).json(result);
}

export async function getSalaryStructure(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const { employeeId } = req.params;
  if (!employeeId) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  const { asOf } = req.query as Record<string, string | undefined>;
  const result = await payrollService.getSalaryStructure(getOrgId(req), employeeId, asOf, actor);
  res.json(result);
}

// --- Payroll run ---

export async function runPayroll(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const result = await payrollService.runPayroll(getOrgId(req), req.body, actor);
  res.json(result);
}

// --- Payslips ---

export async function getMyPayslips(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const result = await payrollService.getMyPayslips(getOrgId(req), requireEmployeeId(actor));
  res.json(result);
}

export async function getMyPayslipById(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const { id } = req.params;
  if (!id) throw new DomainError("NOT_FOUND", "Payslip not found.", 404);
  const result = await payrollService.getMyPayslipById(getOrgId(req), requireEmployeeId(actor), id);
  res.json(result);
}

function sendPdf(res: Response, out: { pdf: Buffer; filename: string }) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`);
  res.send(out.pdf);
}

export async function getMyPayslipPdf(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  sendPdf(res, await payrollService.getMyPayslipPdf(getOrgId(req), requireEmployeeId(actor), req.params.id ?? ""));
}

export async function getPayslipPdf(req: Request, res: Response): Promise<void> {
  sendPdf(res, await payrollService.getPayslipPdf(getOrgId(req), req.params.id ?? ""));
}

export async function getTeamPayslips(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const { periodMonth, periodYear } = req.query as Record<string, string | undefined>;
  const result = await payrollService.getTeamPayslips(getOrgId(req), actor, {
    periodMonth: periodMonth ? Number(periodMonth) : undefined,
    periodYear: periodYear ? Number(periodYear) : undefined,
  });
  res.json(result);
}

export async function listPayslipsOrgWide(req: Request, res: Response): Promise<void> {
  const { employeeId, periodMonth, periodYear } = req.query as Record<string, string | undefined>;
  const result = await payrollService.getPayslipsOrgWide(getOrgId(req), {
    employeeId,
    periodMonth: periodMonth ? Number(periodMonth) : undefined,
    periodYear: periodYear ? Number(periodYear) : undefined,
  });
  res.json(result);
}
