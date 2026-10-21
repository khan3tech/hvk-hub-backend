import { Router } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./controller.js";
import { AssetSchema, AssignAssetRequestSchema, CreateAssetRequestSchema, MarkAssetRequestSchema } from "./schema.js";

// Contract: specs/014-asset-expense-management/contracts/assets-expenses-api.md.
// "HR/Admin (or an IT owner role)": IT has no login role, so Admin covers it.
export const assetsRouter = Router();
assetsRouter.use(authenticate);
const HR = authorize("ADMIN", "HR");
const TAG = "Assets";

assetsRouter.post("/", HR, validate(CreateAssetRequestSchema), handle(c.create));
assetsRouter.get("/", HR, handle(c.list));
assetsRouter.get("/employees/:employeeId", handle(c.forEmployee));
assetsRouter.get("/:id", HR, handle(c.get));
assetsRouter.post("/:id/assign", HR, validate(AssignAssetRequestSchema), handle(c.assign));
assetsRouter.post("/:id/return", HR, handle(c.ret));
assetsRouter.post("/:id/mark", HR, validate(MarkAssetRequestSchema), handle(c.mark));

const id = z.object({ id: z.string() });
documentRoute({ method: "post", path: "/assets", tag: TAG, description: "Add an asset (unique identifier) as UNASSIGNED. Admin/HR.", body: CreateAssetRequestSchema, response: AssetSchema });
documentRoute({ method: "get", path: "/assets", tag: TAG, description: "Inventory, optionally by status. Admin/HR.", query: z.object({ status: z.string().optional() }), response: z.array(AssetSchema) });
documentRoute({ method: "get", path: "/assets/employees/{employeeId}", tag: TAG, description: "Assets an employee currently holds (self, their manager, HR/Admin).", params: z.object({ employeeId: z.string() }) });
documentRoute({ method: "get", path: "/assets/{id}", tag: TAG, description: "An asset with its assignment history. Admin/HR.", params: id });
documentRoute({ method: "post", path: "/assets/{id}/assign", tag: TAG, status: 200, description: "Assign an unassigned asset (409 if already assigned); completes the hire's onboarding asset task. Admin/HR.", params: id, body: AssignAssetRequestSchema, response: AssetSchema });
documentRoute({ method: "post", path: "/assets/{id}/return", tag: TAG, status: 200, description: "Mark returned (unassigned again); the last return completes the exit asset task. Admin/HR.", params: id, response: AssetSchema });
documentRoute({ method: "post", path: "/assets/{id}/mark", tag: TAG, status: 200, description: "Mark LOST or DAMAGED (leaves the assignable pool). Admin/HR.", params: id, body: MarkAssetRequestSchema, response: AssetSchema });
