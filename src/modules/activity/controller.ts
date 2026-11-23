// Parses the request, calls the service, shapes the response (specs/029-activity-presence).
import type { Request, Response } from "express";
import type { z } from "zod";
import { DomainError } from "../../middleware/errorHandler.js";
import { orgOf } from "../../lib/tenant.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";
import { TeamQuerySchema, TimelineQuerySchema } from "./schema.js";

const actorOf = (req: Request) => req.user as AccessTokenPayload;

function parseQuery<S extends z.ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    throw new DomainError("VALIDATION_ERROR", "Query parameters failed validation.", 400, result.error.flatten().fieldErrors as Record<string, string[]>);
  }
  return result.data;
}

export async function heartbeat(req: Request, res: Response) {
  res.status(202).json(await service.heartbeat(orgOf(req), req.body.state, actorOf(req)));
}
export async function getSettings(req: Request, res: Response) {
  res.json(await service.getSettings(orgOf(req)));
}
export async function updateSettings(req: Request, res: Response) {
  res.json(await service.updateSettings(orgOf(req), req.body));
}
export async function presence(req: Request, res: Response) {
  res.json(await service.listPresence(orgOf(req), actorOf(req)));
}
export async function timeline(req: Request, res: Response) {
  res.json(await service.getTimeline(orgOf(req), actorOf(req), parseQuery(TimelineQuerySchema, req)));
}
export async function team(req: Request, res: Response) {
  res.json(await service.teamDay(orgOf(req), actorOf(req), parseQuery(TeamQuerySchema, req)));
}
