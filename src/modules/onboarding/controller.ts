// Parses the request, calls the service, shapes the response (specs/007-employee-onboarding).
import type { Request, Response } from "express";
import { orgOf } from "../../lib/tenant.js";
import { DomainError } from "../../middleware/errorHandler.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

const orgId = (req: Request) => orgOf(req);
const actorOf = (req: Request) => req.user as AccessTokenPayload;
const param = (req: Request, name: string) => req.params[name] ?? "";

export async function listTemplate(req: Request, res: Response) {
  res.json(await service.listTemplate(orgId(req)));
}
export async function addTemplateTask(req: Request, res: Response) {
  res.status(201).json(await service.addTemplateTask(orgId(req), req.body));
}
export async function updateTemplateTask(req: Request, res: Response) {
  res.json(await service.updateTemplateTask(orgId(req), param(req, "id"), req.body));
}
export async function removeTemplateTask(req: Request, res: Response) {
  await service.removeTemplateTask(orgId(req), param(req, "id"));
  res.status(204).send();
}

export async function attachChecklist(req: Request, res: Response) {
  res.status(201).json(await service.attachChecklist(orgId(req), param(req, "employeeId"), actorOf(req)));
}
export async function getChecklist(req: Request, res: Response) {
  res.json(await service.getChecklist(orgId(req), param(req, "employeeId"), actorOf(req)));
}
export async function getMyChecklist(req: Request, res: Response) {
  const actor = actorOf(req);
  if (!actor.employeeId) throw new DomainError("NOT_FOUND", "You have no onboarding checklist.", 404);
  res.json(await service.getChecklist(orgId(req), actor.employeeId, actor));
}

export async function addTask(req: Request, res: Response) {
  res.status(201).json(await service.addTask(orgId(req), param(req, "employeeId"), req.body, actorOf(req)));
}
export async function updateTask(req: Request, res: Response) {
  res.json(await service.updateTask(orgId(req), param(req, "id"), req.body, actorOf(req)));
}
export async function removeTask(req: Request, res: Response) {
  await service.removeTask(orgId(req), param(req, "id"), actorOf(req));
  res.status(204).send();
}
export async function completeTask(req: Request, res: Response) {
  res.json(await service.completeTask(orgId(req), param(req, "id"), actorOf(req)));
}
export async function listMyTasks(req: Request, res: Response) {
  res.json(await service.listMyTasks(orgId(req), actorOf(req)));
}
export async function getOverview(req: Request, res: Response) {
  res.json(await service.getOverview(orgId(req)));
}
