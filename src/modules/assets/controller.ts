// Parses the request, calls the service, shapes the response (specs/014, asset inventory).
import type { Request, Response } from "express";
import { orgOf } from "../../lib/tenant.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

const orgId = (req: Request) => orgOf(req);
const actorOf = (req: Request) => req.user as AccessTokenPayload;
const param = (req: Request, name: string) => req.params[name] ?? "";

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createAsset(orgId(req), req.body, actorOf(req)));
}
export async function list(req: Request, res: Response) {
  res.json(await service.listAssets(orgId(req), typeof req.query.status === "string" ? req.query.status : undefined));
}
export async function get(req: Request, res: Response) {
  res.json(await service.getAsset(orgId(req), param(req, "id")));
}
export async function assign(req: Request, res: Response) {
  res.json(await service.assignAsset(orgId(req), param(req, "id"), req.body.employeeId, actorOf(req)));
}
export async function ret(req: Request, res: Response) {
  res.json(await service.returnAsset(orgId(req), param(req, "id"), actorOf(req)));
}
export async function mark(req: Request, res: Response) {
  res.json(await service.markAsset(orgId(req), param(req, "id"), req.body.status, actorOf(req)));
}
export async function forEmployee(req: Request, res: Response) {
  res.json(await service.assetsForEmployee(orgId(req), param(req, "employeeId"), actorOf(req)));
}
