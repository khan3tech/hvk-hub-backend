import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { orgOf } from "../../lib/tenant.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

// FR-008: every background-check route is HR/Admin only. Contract: contracts/bgv-api.md.
export const bgvRouter = Router();
bgvRouter.use(authenticate, authorize("ADMIN", "HR"));
const TAG = "Background Verification";

const Label = z.string().trim().min(2).max(120);
const InitiateSchema = z.object({ applicationId: z.string(), items: z.array(Label).min(1).max(20).optional() });
const ResultSchema = z.object({ result: z.enum(["CLEARED", "FLAGGED", "UNABLE_TO_VERIFY"]), notes: z.string().max(5000).optional() });
const AddItemSchema = z.object({ label: Label });
const DefaultsSchema = z.object({ defaultItems: z.array(Label).min(1).max(20) });
const actorOf = (req: Request) => req.user as AccessTokenPayload;
const id = (req: Request) => req.params.id ?? "";

bgvRouter.get("/defaults", handle(async (req: Request, res: Response) => {
  res.json(await service.getDefaults(orgOf(req)));
}));
bgvRouter.put("/defaults", validate(DefaultsSchema), handle(async (req: Request, res: Response) => {
  res.json(await service.setDefaults(orgOf(req), req.body.defaultItems));
}));
bgvRouter.post("/checks", validate(InitiateSchema), handle(async (req: Request, res: Response) => {
  res.status(201).json(await service.initiate(orgOf(req), req.body.applicationId, req.body.items, actorOf(req)));
}));
bgvRouter.get("/checks", handle(async (req: Request, res: Response) => {
  res.json(await service.list(orgOf(req), typeof req.query.status === "string" ? req.query.status : undefined));
}));
bgvRouter.get("/checks/:id", handle(async (req: Request, res: Response) => {
  res.json(await service.getCheck(orgOf(req), id(req)));
}));
bgvRouter.get("/applications/:id", handle(async (req: Request, res: Response) => {
  res.json(await service.getForApplication(orgOf(req), id(req)));
}));
bgvRouter.post("/checks/:id/items", validate(AddItemSchema), handle(async (req: Request, res: Response) => {
  res.status(201).json(await service.addItem(orgOf(req), id(req), req.body.label, actorOf(req)));
}));
bgvRouter.post("/items/:id/result", validate(ResultSchema), handle(async (req: Request, res: Response) => {
  res.json(await service.recordResult(orgOf(req), id(req), req.body, actorOf(req)));
}));

const idp = z.object({ id: z.string() });
documentRoute({ method: "get", path: "/bgv/defaults", tag: TAG, description: "Default check items. Admin/HR." });
documentRoute({ method: "put", path: "/bgv/defaults", tag: TAG, description: "Set default check items. Admin/HR.", body: DefaultsSchema });
documentRoute({ method: "post", path: "/bgv/checks", tag: TAG, description: "Initiate a check on an application (items or defaults). Admin/HR.", body: InitiateSchema });
documentRoute({ method: "get", path: "/bgv/checks", tag: TAG, description: "Checks, filterable by status. Admin/HR.", query: z.object({ status: z.string().optional() }) });
documentRoute({ method: "get", path: "/bgv/checks/{id}", tag: TAG, description: "A check with items, results, notes and hire overrides. Admin/HR.", params: idp });
documentRoute({ method: "get", path: "/bgv/applications/{id}", tag: TAG, description: "The check for an application. Admin/HR.", params: idp });
documentRoute({ method: "post", path: "/bgv/checks/{id}/items", tag: TAG, description: "Add an item (reopens a completed check). Admin/HR.", params: idp, body: AddItemSchema });
documentRoute({ method: "post", path: "/bgv/items/{id}/result", tag: TAG, status: 200, description: "Record CLEARED / FLAGGED / UNABLE_TO_VERIFY with notes (once per item). Admin/HR.", params: idp, body: ResultSchema });
