// Parses/validates the request (via schema.ts + the validate middleware),
// calls one or more services, and shapes the HTTP response. No business
// logic here — see specs/002-employee-management/spec.md for what this module must do.
import type { Request, Response } from "express";
import { DomainError } from "../../middleware/errorHandler.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as employeeService from "./service.js";

function getOrgId(): string {
  return process.env.DEFAULT_ORG_ID ?? "default";
}

export async function createEmployee(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const result = await employeeService.createEmployee(getOrgId(), req.body, actor);
  res.status(201).json(result);
}

export async function getEmployee(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const { id } = req.params;
  if (!id) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  const employee = await employeeService.getEmployee(getOrgId(), id, actor);
  res.json(employee);
}

export async function listEmployees(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const { department, designation, status } = req.query as Record<string, string | undefined>;
  const result = await employeeService.listEmployeesForRequester(getOrgId(), actor, {
    department,
    designation,
    status,
  });
  res.json(result);
}

export async function searchDirectory(req: Request, res: Response): Promise<void> {
  const { q, department, designation } = req.query as Record<string, string | undefined>;
  const result = await employeeService.searchDirectory(getOrgId(), { q, department, designation });
  res.json(result);
}

export async function updateEmployee(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const { id } = req.params;
  if (!id) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  const result = await employeeService.updateEmployee(getOrgId(), id, req.body, actor);
  res.json(result);
}

export async function offboardEmployee(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const { id } = req.params;
  if (!id) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  const result = await employeeService.offboardEmployee(getOrgId(), id, actor);
  res.json(result);
}

export async function getTeamView(req: Request, res: Response): Promise<void> {
  const actor = req.user as AccessTokenPayload;
  const result = await employeeService.getTeamView(getOrgId(), actor);
  res.json(result);
}

export async function listDepartments(_req: Request, res: Response): Promise<void> {
  const result = await employeeService.listDepartments(getOrgId());
  res.json(result);
}

export async function createDepartment(req: Request, res: Response): Promise<void> {
  const result = await employeeService.createDepartment(getOrgId(), req.body.name);
  res.status(201).json(result);
}

export async function listDesignations(_req: Request, res: Response): Promise<void> {
  const result = await employeeService.listDesignations(getOrgId());
  res.json(result);
}

export async function createDesignation(req: Request, res: Response): Promise<void> {
  const result = await employeeService.createDesignation(getOrgId(), req.body.title, req.body.level);
  res.status(201).json(result);
}
