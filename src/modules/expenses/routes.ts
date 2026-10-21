import { Router } from "express";
import { z } from "zod";
import { documentRoute, registry } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { uploadFile } from "../../middleware/upload.js";
import * as c from "./controller.js";
import {
  CategorySchema,
  ClaimSchema,
  CreateCategoryRequestSchema,
  PayoutsSchema,
  RejectClaimRequestSchema,
  SubmitClaimFieldsSchema,
  UpdateCategoryRequestSchema,
} from "./schema.js";

// Contract: specs/014-asset-expense-management/contracts/assets-expenses-api.md. Manager
// routing by the live reporting line (FR-009) is enforced in service.ts.
export const expensesRouter = Router();
expensesRouter.use(authenticate);
const HR = authorize("ADMIN", "HR");
const TAG = "Expenses";

expensesRouter.get("/categories", handle(c.listCategories));
expensesRouter.post("/categories", HR, validate(CreateCategoryRequestSchema), handle(c.createCategory));
expensesRouter.patch("/categories/:id", HR, validate(UpdateCategoryRequestSchema), handle(c.updateCategory));
expensesRouter.post("/claims", uploadFile(false), validate(SubmitClaimFieldsSchema), handle(c.submit));
expensesRouter.get("/claims/me", handle(c.mine));
expensesRouter.get("/claims/queue", authorize("ADMIN", "HR", "MANAGER"), handle(c.queue));
expensesRouter.get("/payouts", HR, handle(c.payouts));
expensesRouter.get("/claims/:id", handle(c.get));
expensesRouter.get("/claims/:id/receipt", handle(c.receipt));
expensesRouter.post("/claims/:id/approve", authorize("ADMIN", "HR", "MANAGER"), handle(c.approve));
expensesRouter.post("/claims/:id/reject", authorize("ADMIN", "HR", "MANAGER"), validate(RejectClaimRequestSchema), handle(c.reject));
expensesRouter.post("/claims/:id/pay", HR, handle(c.pay));

const id = z.object({ id: z.string() });
registry.registerPath({
  method: "post",
  path: "/expenses/claims",
  tags: [TAG],
  security: [{ bearerAuth: [] }],
  description: "Submit a claim (multipart: amount, category, description?, file?). Receipt required for categories that need one.",
  request: { body: { content: { "multipart/form-data": { schema: SubmitClaimFieldsSchema.extend({ file: z.string().openapi({ type: "string", format: "binary" }).optional() }) } } } },
  responses: { 201: { description: "Submitted.", content: { "application/json": { schema: ClaimSchema } } } },
});
documentRoute({ method: "get", path: "/expenses/categories", tag: TAG, description: "Active expense categories (?all=true includes inactive).", query: z.object({ all: z.enum(["true", "false"]).optional() }), response: z.array(CategorySchema) });
documentRoute({ method: "post", path: "/expenses/categories", tag: TAG, description: "Add a category. Admin/HR.", body: CreateCategoryRequestSchema, response: CategorySchema });
documentRoute({ method: "patch", path: "/expenses/categories/{id}", tag: TAG, description: "Change receipt requirement / deactivate. Admin/HR.", params: id, body: UpdateCategoryRequestSchema, response: CategorySchema });
documentRoute({ method: "get", path: "/expenses/claims/me", tag: TAG, description: "Your claims.", response: z.array(ClaimSchema) });
documentRoute({ method: "get", path: "/expenses/claims/queue", tag: TAG, description: "Pending claims to decide: current direct reports' (Manager) or all (HR/Admin).", response: z.array(ClaimSchema) });
documentRoute({ method: "get", path: "/expenses/payouts", tag: TAG, description: "Approved-unpaid claims and their total. Admin/HR.", response: PayoutsSchema });
documentRoute({ method: "get", path: "/expenses/claims/{id}", tag: TAG, description: "One claim (claimant, current manager, HR/Admin).", params: id, response: ClaimSchema });
documentRoute({ method: "get", path: "/expenses/claims/{id}/receipt", tag: TAG, description: "Download the receipt (same visibility as the claim).", params: id });
documentRoute({ method: "post", path: "/expenses/claims/{id}/approve", tag: TAG, status: 200, description: "Approve (current manager or HR/Admin, never your own).", params: id, response: ClaimSchema });
documentRoute({ method: "post", path: "/expenses/claims/{id}/reject", tag: TAG, status: 200, description: "Reject with a required reason.", params: id, body: RejectClaimRequestSchema, response: ClaimSchema });
documentRoute({ method: "post", path: "/expenses/claims/{id}/pay", tag: TAG, status: 200, description: "Mark an approved claim paid. Admin/HR.", params: id, response: ClaimSchema });
