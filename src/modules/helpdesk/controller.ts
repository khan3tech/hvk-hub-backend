// Parses the request, calls the service, shapes the response (specs/017-hr-helpdesk-ticketing).
import type { Request, Response } from "express";
import { orgOf } from "../../lib/tenant.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

const actorOf = (req: Request) => req.user as AccessTokenPayload;
const id = (req: Request) => req.params.id ?? "";
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export async function categories(req: Request, res: Response) {
  res.json(await service.listCategories(orgOf(req), req.query.all !== "true"));
}
export async function createCategory(req: Request, res: Response) {
  res.status(201).json(await service.createCategory(orgOf(req), req.body.name));
}
export async function updateCategory(req: Request, res: Response) {
  res.json(await service.updateCategory(orgOf(req), id(req), req.body));
}
export async function getSettings(req: Request, res: Response) {
  res.json(await service.getSettings(orgOf(req)));
}
export async function updateSettings(req: Request, res: Response) {
  res.json(await service.updateSettings(orgOf(req), req.body.overdueHours));
}
export async function raise(req: Request, res: Response) {
  res.status(201).json(await service.raiseTicket(orgOf(req), req.body, actorOf(req)));
}
export async function mine(req: Request, res: Response) {
  res.json(await service.myTickets(orgOf(req), actorOf(req)));
}
export async function queue(req: Request, res: Response) {
  res.json(await service.queue(orgOf(req), { status: str(req.query.status), categoryId: str(req.query.categoryId), includeResolved: req.query.includeResolved === "true" }));
}
export async function get(req: Request, res: Response) {
  res.json(await service.getTicket(orgOf(req), id(req), actorOf(req)));
}
export async function assign(req: Request, res: Response) {
  res.json(await service.assign(orgOf(req), id(req), req.body.assigneeId, actorOf(req)));
}
export async function reply(req: Request, res: Response) {
  res.json(await service.reply(orgOf(req), id(req), req.body.message, actorOf(req)));
}
export async function resolve(req: Request, res: Response) {
  res.json(await service.resolve(orgOf(req), id(req), actorOf(req)));
}
export async function reopen(req: Request, res: Response) {
  res.json(await service.reopen(orgOf(req), id(req), actorOf(req)));
}
export async function summary(req: Request, res: Response) {
  res.json(await service.summary(orgOf(req)));
}
