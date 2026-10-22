// Parses the request, calls the service, shapes the response (specs/018-employee-engagement-surveys).
import type { Request, Response } from "express";
import { orgOf } from "../../lib/tenant.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

const actorOf = (req: Request) => req.user as AccessTokenPayload;
const id = (req: Request) => req.params.id ?? "";

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createSurvey(orgOf(req), req.body, actorOf(req)));
}
export async function list(req: Request, res: Response) {
  res.json(await service.listSurveysForHr(orgOf(req)));
}
export async function get(req: Request, res: Response) {
  res.json(await service.getSurveyForHr(orgOf(req), id(req)));
}
export async function close(req: Request, res: Response) {
  res.json(await service.closeSurvey(orgOf(req), id(req)));
}
export async function results(req: Request, res: Response) {
  res.json(await service.results(orgOf(req), id(req)));
}
export async function trend(req: Request, res: Response) {
  res.json(await service.trend(orgOf(req)));
}
export async function pending(req: Request, res: Response) {
  res.json(await service.pendingFor(orgOf(req), actorOf(req)));
}
export async function submit(req: Request, res: Response) {
  res.status(201).json(await service.submit(orgOf(req), id(req), req.body, actorOf(req)));
}
