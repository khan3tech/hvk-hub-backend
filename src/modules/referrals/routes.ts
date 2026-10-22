import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { documentRoute, registry } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { orgOf } from "../../lib/tenant.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { uploadFile } from "../../middleware/upload.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

// Contract: specs/021-referral-program/contracts/referrals-api.md.
export const referralsRouter = Router();
referralsRouter.use(authenticate);
const HR = authorize("ADMIN", "HR");
const TAG = "Referrals";

const SubmitSchema = z.object({
  postingId: z.string(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().min(5).max(30).optional(),
});
const ConfigSchema = z.object({ bonusAmount: z.number().min(0).max(10_000_000), qualifyingDays: z.number().int().min(0).max(3650) });
const ScheduleSchema = z.object({ periodMonth: z.number().int().min(1).max(12), periodYear: z.number().int().min(2000).max(2100) });
const LinkSchema = z.object({ employeeId: z.string() });
const actorOf = (req: Request) => req.user as AccessTokenPayload;
const id = (req: Request) => req.params.id ?? "";

referralsRouter.post("/", uploadFile(false), validate(SubmitSchema), handle(async (req: Request, res: Response) => {
  res.status(201).json(await service.submitReferral(orgOf(req), req.body, req.file, actorOf(req)));
}));
referralsRouter.get("/me", handle(async (req: Request, res: Response) => {
  res.json(await service.myReferrals(orgOf(req), actorOf(req)));
}));
referralsRouter.get("/config", handle(async (req: Request, res: Response) => {
  res.json(await service.getConfig(orgOf(req)));
}));
referralsRouter.put("/config", HR, validate(ConfigSchema), handle(async (req: Request, res: Response) => {
  res.json(await service.setConfig(orgOf(req), req.body.bonusAmount, req.body.qualifyingDays));
}));
referralsRouter.get("/", HR, handle(async (req: Request, res: Response) => {
  res.json(await service.allReferrals(orgOf(req), typeof req.query.status === "string" ? req.query.status : undefined));
}));
referralsRouter.post("/:id/link-hire", HR, validate(LinkSchema), handle(async (req: Request, res: Response) => {
  res.json(await service.linkHire(orgOf(req), id(req), req.body.employeeId));
}));
referralsRouter.post("/:id/schedule-payout", HR, validate(ScheduleSchema), handle(async (req: Request, res: Response) => {
  res.json(await service.schedulePayout(orgOf(req), id(req), req.body.periodMonth, req.body.periodYear));
}));

const idp = z.object({ id: z.string() });
registry.registerPath({
  method: "post",
  path: "/referrals",
  tags: [TAG],
  security: [{ bearerAuth: [] }],
  description: "Refer someone for an open posting (multipart: postingId, name, email, phone?, file = PDF/DOCX resume). Duplicates follow 005 (first channel wins).",
  request: { body: { content: { "multipart/form-data": { schema: SubmitSchema.extend({ file: z.string().openapi({ type: "string", format: "binary" }) }) } } } },
  responses: { 201: { description: "Referred." } },
});
documentRoute({ method: "get", path: "/referrals/me", tag: TAG, description: "Your referrals: stage and bonus status only." });
documentRoute({ method: "get", path: "/referrals/config", tag: TAG, description: "Current bonus amount and qualifying days for new referrals." });
documentRoute({ method: "put", path: "/referrals/config", tag: TAG, description: "Set bonus amount and qualifying days (0 = payable on hire); applies to new referrals only. Admin/HR.", body: ConfigSchema });
documentRoute({ method: "get", path: "/referrals", tag: TAG, description: "All referrals with referrer status and payroll scheduling. Admin/HR.", query: z.object({ status: z.string().optional() }) });
documentRoute({ method: "post", path: "/referrals/{id}/link-hire", tag: TAG, status: 200, description: "Link the hired candidate's employee record (when emails differ). Admin/HR.", params: idp, body: LinkSchema });
documentRoute({ method: "post", path: "/referrals/{id}/schedule-payout", tag: TAG, status: 200, description: "Include a payable bonus in a payroll period (once). Admin/HR.", params: idp, body: ScheduleSchema });
