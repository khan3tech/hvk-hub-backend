// Parses the request, calls the service, shapes the response (specs/007-employee-onboarding).
import type { Request, Response } from "express";
import { DomainError } from "../../middleware/errorHandler.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

const orgId = () => process.env.DEFAULT_ORG_ID ?? "default";
const actorOf = (req: Request) => req.user as AccessTokenPayload;
const param = (req: Request, name: string) => req.params[name] ?? "";

export async function listTemplate(_req: Request, res: Response) {
  res.json(await service.listTemplate(orgId()));
}
export async function addTemplateTask(req: Request, res: Response) {
  res.status(201).json(await service.addTemplateTask(orgId(), req.body));
}
export async function updateTemplateTask(req: Request, res: Response) {
  res.json(await service.updateTemplateTask(orgId(), param(req, "id"), req.body));
}
export async function removeTemplateTask(req: Request, res: Response) {
  await service.removeTemplateTask(orgId(), param(req, "id"));
  res.status(204).send();
}

export async function attachChecklist(req: Request, res: Response) {
  res.status(201).json(await service.attachChecklist(orgId(), param(req, "employeeId"), actorOf(req)));
}
export async function getChecklist(req: Request, res: Response) {
  res.json(await service.getChecklist(orgId(), param(req, "employeeId"), actorOf(req)));
}
export async function getMyChecklist(req: Request, res: Response) {
  const actor = actorOf(req);
  if (!actor.employeeId) throw new DomainError("NOT_FOUND", "You have no onboarding checklist.", 404);
  res.json(await service.getChecklist(orgId(), actor.employeeId, actor));
}

export async function addTask(req: Request, res: Response) {
  res.status(201).json(await service.addTask(orgId(), param(req, "employeeId"), req.body, actorOf(req)));
}
export async function updateTask(req: Request, res: Response) {
  res.json(await service.updateTask(orgId(), param(req, "id"), req.body, actorOf(req)));
}
export async function removeTask(req: Request, res: Response) {
  await service.removeTask(orgId(), param(req, "id"), actorOf(req));
  res.status(204).send();
}
export async function completeTask(req: Request, res: Response) {
  res.json(await service.completeTask(orgId(), param(req, "id"), actorOf(req)));
}
export async function listMyTasks(req: Request, res: Response) {
  res.json(await service.listMyTasks(orgId(), actorOf(req)));
}
export async function getOverview(_req: Request, res: Response) {
  res.json(await service.getOverview(orgId()));
}
