// Parses the request, calls the service, shapes the response (specs/009-resignation-exit).
import type { Request, Response } from "express";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

const orgId = () => process.env.DEFAULT_ORG_ID ?? "default";
const actorOf = (req: Request) => req.user as AccessTokenPayload;
const id = (req: Request) => req.params.id ?? "";

export async function submit(req: Request, res: Response) {
  res.status(201).json(await service.submitResignation(orgId(), req.body, actorOf(req)));
}
export async function mine(req: Request, res: Response) {
  res.json(await service.getMyResignations(orgId(), actorOf(req)));
}
export async function list(req: Request, res: Response) {
  res.json(await service.listResignations(orgId(), actorOf(req), req.query.status as string | undefined));
}
export async function get(req: Request, res: Response) {
  res.json(await service.getResignation(orgId(), id(req), actorOf(req)));
}
export async function acknowledge(req: Request, res: Response) {
  res.json(await service.acknowledgeResignation(orgId(), id(req), req.body.confirmedLastDay, actorOf(req)));
}
export async function withdraw(req: Request, res: Response) {
  res.json(await service.withdrawResignation(orgId(), id(req), actorOf(req)));
}
export async function exitInterview(req: Request, res: Response) {
  res.json(await service.recordExitInterview(orgId(), id(req), req.body.notes, actorOf(req)));
}
export async function checklist(req: Request, res: Response) {
  res.json(await service.getChecklist(orgId(), id(req)));
}
export async function completeTask(req: Request, res: Response) {
  res.json(await service.completeExitTask(orgId(), id(req), actorOf(req)));
}
export async function offboard(req: Request, res: Response) {
  res.json(await service.completeOffboarding(orgId(), id(req), req.body.force === true, actorOf(req)));
}
