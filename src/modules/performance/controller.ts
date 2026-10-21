// Parses the request, calls the service, shapes the response (specs/012-performance-management).
import type { Request, Response } from "express";
import { orgOf } from "../../lib/tenant.js";
import { DomainError } from "../../middleware/errorHandler.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

const orgId = (req: Request) => orgOf(req);
const actorOf = (req: Request) => req.user as AccessTokenPayload;
const param = (req: Request, name: string) => req.params[name] ?? "";

export async function createGoal(req: Request, res: Response) {
  res.status(201).json(await service.createGoal(orgId(req), req.body, actorOf(req)));
}
export async function myGoals(req: Request, res: Response) {
  const actor = actorOf(req);
  if (!actor.employeeId) throw new DomainError("NOT_FOUND", "You have no employee record.", 404);
  res.json(await service.listGoals(orgId(req), actor.employeeId, actor));
}
export async function employeeGoals(req: Request, res: Response) {
  res.json(await service.listGoals(orgId(req), param(req, "employeeId"), actorOf(req)));
}
export async function approveGoal(req: Request, res: Response) {
  res.json(await service.approveGoal(orgId(req), param(req, "id"), actorOf(req)));
}
export async function requestChanges(req: Request, res: Response) {
  res.json(await service.requestGoalChanges(orgId(req), param(req, "id"), req.body.note, actorOf(req)));
}
export async function reviseGoal(req: Request, res: Response) {
  res.json(await service.reviseGoal(orgId(req), param(req, "id"), req.body, actorOf(req)));
}
export async function updateProgress(req: Request, res: Response) {
  res.json(await service.updateGoalProgress(orgId(req), param(req, "id"), req.body, actorOf(req)));
}

export async function createCycle(req: Request, res: Response) {
  res.status(201).json(await service.createCycle(orgId(req), req.body, actorOf(req)));
}
export async function listCycles(req: Request, res: Response) {
  res.json(await service.listCycles(orgId(req)));
}
export async function cycleStatus(req: Request, res: Response) {
  res.json(await service.cycleStatus(orgId(req), param(req, "id")));
}

export async function reviewsToDo(req: Request, res: Response) {
  res.json(await service.listReviewsToDo(orgId(req), actorOf(req)));
}
export async function getReview(req: Request, res: Response) {
  res.json(await service.getReview(orgId(req), param(req, "id"), actorOf(req)));
}
export async function saveDraft(req: Request, res: Response) {
  res.json(await service.saveManagerDraft(orgId(req), param(req, "id"), req.body, actorOf(req)));
}
export async function selfReflection(req: Request, res: Response) {
  res.json(await service.addSelfReflection(orgId(req), param(req, "id"), req.body.employeeComments, actorOf(req)));
}
export async function finalize(req: Request, res: Response) {
  res.json(await service.finalizeReview(orgId(req), param(req, "id"), actorOf(req)));
}
export async function correct(req: Request, res: Response) {
  res.json(await service.correctReview(orgId(req), param(req, "id"), req.body, actorOf(req)));
}
export async function history(req: Request, res: Response) {
  res.json(await service.employeeHistory(orgId(req), param(req, "employeeId"), actorOf(req)));
}
