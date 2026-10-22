import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { documentRoute, registry } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { issueChallenge } from "../../lib/botcheck.js";
import { validate } from "../../middleware/validate.js";
import { uploadFile } from "../../middleware/upload.js";
import * as service from "./service.js";

// Public, unauthenticated careers API (specs/020). Contract: contracts/careers-api.md.
export const careersRouter = Router();
const TAG = "Public Careers";

const applyLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
const statusLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const ApplyFieldsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(5).max(30).optional(),
  challenge: z.string().optional(),
  solution: z.string().optional(),
  website: z.string().optional(), // honeypot: must stay empty
});
const StatusSchema = z.object({ email: z.string().trim().email(), reference: z.string().trim().min(6).max(40) });

const slug = (req: Request) => req.params.org ?? "";

careersRouter.get("/:org/postings", readLimiter, handle(async (req: Request, res: Response) => {
  res.json(await service.listPostings(slug(req)));
}));
careersRouter.get("/:org/postings/:id", readLimiter, handle(async (req: Request, res: Response) => {
  res.json(await service.getPosting(slug(req), req.params.id ?? ""));
}));
careersRouter.get("/:org/challenge", readLimiter, handle(async (_req: Request, res: Response) => {
  res.json(issueChallenge("careers-apply"));
}));
careersRouter.post("/:org/postings/:id/applications", applyLimiter, uploadFile(false), validate(ApplyFieldsSchema), handle(async (req: Request, res: Response) => {
  res.status(201).json(await service.apply(slug(req), req.params.id ?? "", req.body, req.file));
}));
careersRouter.post("/:org/status", statusLimiter, validate(StatusSchema), handle(async (req: Request, res: Response) => {
  res.json(await service.checkStatus(slug(req), req.body.email, req.body.reference));
}));

const org = z.object({ org: z.string() });
documentRoute({ method: "get", path: "/public/careers/{org}/postings", tag: TAG, auth: false, description: "Open roles (title, department, description). No account needed.", params: org });
documentRoute({ method: "get", path: "/public/careers/{org}/postings/{id}", tag: TAG, auth: false, description: "One open role (404 once closed/on hold).", params: org.extend({ id: z.string() }) });
documentRoute({ method: "get", path: "/public/careers/{org}/challenge", tag: TAG, auth: false, description: "Bot-check challenge: find `solution` so sha256(nonce:solution) has `bits` leading zero bits; submit after `minFillMs`.", params: org });
registry.registerPath({
  method: "post",
  path: "/public/careers/{org}/postings/{id}/applications",
  tags: [TAG],
  description: "Apply (multipart): name, email, phone?, challenge, solution, website (leave empty), file (PDF/DOCX resume). Returns a reference shown once.",
  request: { params: org.extend({ id: z.string() }), body: { content: { "multipart/form-data": { schema: ApplyFieldsSchema.extend({ file: z.string().openapi({ type: "string", format: "binary" }) }) } } } },
  responses: { 201: { description: "Received." } },
});
documentRoute({ method: "post", path: "/public/careers/{org}/status", tag: TAG, auth: false, status: 200, description: "Check an application's status with email + reference (generic 404 otherwise).", params: org, body: StatusSchema });
