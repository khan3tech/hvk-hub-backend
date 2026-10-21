// Parses the request, calls the service, shapes the response (specs/016-org-chart-visualization).
import type { Request, Response } from "express";
import { orgOf } from "../../lib/tenant.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

const actorOf = (req: Request) => req.user as AccessTokenPayload;
const int = (v: unknown, fallback: number) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : fallback);

export async function chart(req: Request, res: Response) {
  res.json(await service.getChart(orgOf(req), actorOf(req), int(req.query.depth, service.DEFAULT_DEPTH)));
}
export async function children(req: Request, res: Response) {
  res.json(await service.getChildren(orgOf(req), req.params.id ?? "", actorOf(req), int(req.query.depth, 0)));
}
export async function search(req: Request, res: Response) {
  res.json(await service.search(orgOf(req), typeof req.query.q === "string" ? req.query.q : "", actorOf(req)));
}
export async function gaps(req: Request, res: Response) {
  res.json(await service.structuralGaps(orgOf(req)));
}
export async function setTop(req: Request, res: Response) {
  res.json(await service.setTop(orgOf(req), req.body.employeeId ?? null));
}
