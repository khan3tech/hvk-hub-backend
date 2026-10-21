// Parses the request, calls the service, shapes the response (specs/008-document-esignature).
import type { Request, Response } from "express";
import { orgOf } from "../../lib/tenant.js";
import type { Readable } from "node:stream";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

const orgId = (req: Request) => orgOf(req);
const actorOf = (req: Request) => req.user as AccessTokenPayload;
const param = (req: Request, name: string) => req.params[name] ?? "";
const wantsHistory = (req: Request) => req.query.history === "true";

function sendFile(res: Response, doc: { contentType: string | null; originalName: string | null; label: string }, stream: Readable) {
  const name = (doc.originalName ?? doc.label).replace(/[^\w.\- ]/g, "_");
  res.setHeader("Content-Type", doc.contentType ?? "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.setHeader("Cache-Control", "private, no-store");
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

export async function uploadEmployeeDocument(req: Request, res: Response) {
  const fields = req.body;
  res.status(201).json(await service.uploadEmployeeDocument(orgId(req), param(req, "employeeId"), fields, req.file!, actorOf(req)));
}
export async function uploadCandidateDocument(req: Request, res: Response) {
  const fields = req.body;
  res.status(201).json(await service.uploadCandidateDocument(orgId(req), param(req, "candidateId"), fields, req.file!, actorOf(req)));
}
export async function listEmployeeDocuments(req: Request, res: Response) {
  res.json(await service.listEmployeeDocuments(orgId(req), param(req, "employeeId"), actorOf(req), wantsHistory(req)));
}
export async function listCandidateDocuments(req: Request, res: Response) {
  res.json(await service.listCandidateDocuments(orgId(req), param(req, "candidateId"), wantsHistory(req)));
}
export async function downloadDocument(req: Request, res: Response) {
  const { doc, stream } = await service.openDocument(orgId(req), param(req, "id"), actorOf(req));
  sendFile(res, doc, stream);
}

export async function requestSignature(req: Request, res: Response) {
  res.status(201).json(await service.requestSignature(orgId(req), param(req, "id"), req.body, actorOf(req)));
}
export async function listSignatureRequests(req: Request, res: Response) {
  const { status, applicationId } = req.query as Record<string, string | undefined>;
  res.json(await service.listSignatureRequests(orgId(req), actorOf(req), { status, applicationId }));
}
export async function getSignatureRequest(req: Request, res: Response) {
  res.json(await service.getSignatureRequest(orgId(req), param(req, "id"), actorOf(req)));
}
export async function signAsEmployee(req: Request, res: Response) {
  res.json(await service.signAsEmployee(orgId(req), param(req, "id"), req.body.fullName, actorOf(req)));
}

export async function getByToken(req: Request, res: Response) {
  res.json(await service.getByToken(param(req, "token")));
}
export async function downloadByToken(req: Request, res: Response) {
  const { doc, stream } = await service.openByToken(param(req, "token"));
  sendFile(res, doc, stream);
}
export async function signByToken(req: Request, res: Response) {
  res.json(await service.signByToken(param(req, "token"), req.body.fullName));
}

export async function publishPolicy(req: Request, res: Response) {
  const { title } = req.body as { title: string };
  res.status(201).json(await service.publishPolicy(orgId(req), title, req.file, actorOf(req)));
}
export async function listPolicies(req: Request, res: Response) {
  res.json(await service.listPolicies(orgId(req), actorOf(req)));
}
export async function acknowledgePolicy(req: Request, res: Response) {
  res.json(await service.acknowledgePolicy(orgId(req), param(req, "id"), actorOf(req)));
}
export async function policyStatus(req: Request, res: Response) {
  res.json(await service.policyStatus(orgId(req), param(req, "id")));
}
