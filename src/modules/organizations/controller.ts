// Platform (super-admin) endpoints (specs/015-multi-tenant-activation).
import type { NextFunction, Request, Response } from "express";
import { DomainError } from "../../middleware/errorHandler.js";
import * as service from "./service.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      superAdminId?: string;
    }
  }
}

// FR-005: a separate tier — only a platform token (own secret) passes; org users' tokens can't.
export async function authenticatePlatform(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new DomainError("UNAUTHENTICATED", "Operator sign-in required.", 401);
    let sub: string;
    try {
      sub = service.verifyPlatformToken(token).sub;
    } catch {
      throw new DomainError("UNAUTHENTICATED", "Operator sign-in required.", 401);
    }
    req.superAdminId = (await service.requireSuperAdmin(sub)).id;
    next();
  } catch (err) {
    next(err);
  }
}

const id = (req: Request) => req.params.id ?? "";

export async function login(req: Request, res: Response) {
  res.json(await service.platformLogin(req.body.email, req.body.password));
}
export async function list(_req: Request, res: Response) {
  res.json(await service.listOrganizations());
}
export async function get(req: Request, res: Response) {
  res.json(await service.getOrganization(id(req)));
}
export async function provision(req: Request, res: Response) {
  res.status(201).json(await service.provisionOrganization(req.body, req.superAdminId!));
}
export async function suspend(req: Request, res: Response) {
  res.json(await service.setOrganizationStatus(id(req), "SUSPENDED", req.superAdminId!));
}
export async function reactivate(req: Request, res: Response) {
  res.json(await service.setOrganizationStatus(id(req), "ACTIVE", req.superAdminId!));
}
