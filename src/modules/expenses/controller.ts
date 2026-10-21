// Parses the request, calls the service, shapes the response (specs/014, expense claims).
import type { Request, Response } from "express";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

const orgId = () => process.env.DEFAULT_ORG_ID ?? "default";
const actorOf = (req: Request) => req.user as AccessTokenPayload;
const param = (req: Request, name: string) => req.params[name] ?? "";

export async function listCategories(req: Request, res: Response) {
  res.json(await service.listCategories(orgId(), req.query.all !== "true"));
}
export async function createCategory(req: Request, res: Response) {
  res.status(201).json(await service.createCategory(orgId(), req.body));
}
export async function updateCategory(req: Request, res: Response) {
  res.json(await service.updateCategory(orgId(), param(req, "id"), req.body));
}
export async function submit(req: Request, res: Response) {
  res.status(201).json(await service.submitClaim(orgId(), req.body, req.file, actorOf(req)));
}
export async function mine(req: Request, res: Response) {
  res.json(await service.myClaims(orgId(), actorOf(req)));
}
export async function queue(req: Request, res: Response) {
  res.json(await service.approvalQueue(orgId(), actorOf(req)));
}
export async function get(req: Request, res: Response) {
  res.json(await service.getClaim(orgId(), param(req, "id"), actorOf(req)));
}
export async function receipt(req: Request, res: Response) {
  const file = await service.openReceipt(orgId(), param(req, "id"), actorOf(req));
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.name.replace(/[^\w.\- ]/g, "_")}"`);
  res.setHeader("Cache-Control", "private, no-store");
  file.stream.on("error", () => res.destroy());
  file.stream.pipe(res);
}
export async function approve(req: Request, res: Response) {
  res.json(await service.approveClaim(orgId(), param(req, "id"), actorOf(req)));
}
export async function reject(req: Request, res: Response) {
  res.json(await service.rejectClaim(orgId(), param(req, "id"), req.body.reason, actorOf(req)));
}
export async function pay(req: Request, res: Response) {
  res.json(await service.markPaid(orgId(), param(req, "id"), actorOf(req)));
}
export async function payouts(_req: Request, res: Response) {
  res.json(await service.payouts(orgId()));
}
