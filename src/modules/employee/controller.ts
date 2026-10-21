// Parses/validates the request (via schema.ts + the validate middleware),
// calls one or more services, and shapes the HTTP response. No business
// logic here — see specs/002-employee-management/spec.md for what this module must do.
import type { Request, Response } from "express";
import { orgOf } from "../../lib/tenant.js";
import { DomainError } from "../../middleware/errorHandler.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as employeeService from "./service.js";

function getOrgId(req: Request): string {
  return orgOf(req);
}

export async function createEmployee(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const result = await employeeService.createEmployee(getOrgId(req), req.body, actor);
  res.status(201).json(result);
}

export async function getEmployee(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const { id } = req.params;
  if (!id) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  const employee = await employeeService.getEmployee(getOrgId(req), id, actor);
  res.json(employee);
}

export async function listEmployees(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const { department, designation, status } = req.query as Record<string, string | undefined>;
  const result = await employeeService.listEmployeesForRequester(getOrgId(req), actor, {
    department,
    designation,
    status,
  });
  res.json(result);
}

export async function searchDirectory(req: Request, res: Response): Promise<void> {
  const { q, department, designation } = req.query as Record<string, string | undefined>;
  const result = await employeeService.searchDirectory(getOrgId(req), { q, department, designation });
  res.json(result);
}

export async function updateEmployee(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const { id } = req.params;
  if (!id) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  const result = await employeeService.updateEmployee(getOrgId(req), id, req.body, actor);
  res.json(result);
}

export async function offboardEmployee(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const { id } = req.params;
  if (!id) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  const result = await employeeService.offboardEmployee(getOrgId(req), id, actor);
  res.json(result);
}

export async function getTeamView(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const result = await employeeService.getTeamView(getOrgId(req), actor);
  res.json(result);
}

export async function listDepartments(req: Request, res: Response): Promise<void> {
  const result = await employeeService.listDepartments(getOrgId(req));
  res.json(result);
}

export async function createDepartment(req: Request, res: Response): Promise<void> {
  const result = await employeeService.createDepartment(getOrgId(req), req.body.name);
  res.status(201).json(result);
}

export async function listDesignations(req: Request, res: Response): Promise<void> {
  const result = await employeeService.listDesignations(getOrgId(req));
  res.json(result);
}

export async function createDesignation(req: Request, res: Response): Promise<void> {
  const result = await employeeService.createDesignation(getOrgId(req), req.body.title, req.body.level);
  res.status(201).json(result);
}

export async function setDepartmentHead(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  res.json(await employeeService.setDepartmentHead(getOrgId(req), req.params.id ?? "", req.body.headEmployeeId ?? null, actor));
}
