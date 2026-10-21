import { Router } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./controller.js";
import {
  AssignRequestSchema,
  CategoryRequestSchema,
  RaiseTicketRequestSchema,
  ReplyRequestSchema,
  SettingsRequestSchema,
  SummarySchema,
  TicketSchema,
  UpdateCategoryRequestSchema,
} from "./schema.js";

// Contract: specs/017-hr-helpdesk-ticketing/contracts/helpdesk-api.md. Requester-only visibility
// (FR-007/008) is enforced in service.ts.
export const helpdeskRouter = Router();
helpdeskRouter.use(authenticate);
const HR = authorize("ADMIN", "HR");
const TAG = "HR Helpdesk";

helpdeskRouter.get("/categories", handle(c.categories));
helpdeskRouter.post("/categories", HR, validate(CategoryRequestSchema), handle(c.createCategory));
helpdeskRouter.patch("/categories/:id", HR, validate(UpdateCategoryRequestSchema), handle(c.updateCategory));
helpdeskRouter.get("/settings", HR, handle(c.getSettings));
helpdeskRouter.put("/settings", HR, validate(SettingsRequestSchema), handle(c.updateSettings));
helpdeskRouter.get("/summary", HR, handle(c.summary));
helpdeskRouter.post("/tickets", validate(RaiseTicketRequestSchema), handle(c.raise));
helpdeskRouter.get("/tickets/me", handle(c.mine));
helpdeskRouter.get("/tickets", HR, handle(c.queue));
helpdeskRouter.get("/tickets/:id", handle(c.get));
helpdeskRouter.post("/tickets/:id/assign", HR, validate(AssignRequestSchema), handle(c.assign));
helpdeskRouter.post("/tickets/:id/replies", validate(ReplyRequestSchema), handle(c.reply));
helpdeskRouter.post("/tickets/:id/resolve", HR, handle(c.resolve));
helpdeskRouter.post("/tickets/:id/reopen", handle(c.reopen));

const id = z.object({ id: z.string() });
documentRoute({ method: "get", path: "/helpdesk/categories", tag: TAG, description: "Ticket categories (?all=true includes inactive).", query: z.object({ all: z.enum(["true", "false"]).optional() }) });
documentRoute({ method: "post", path: "/helpdesk/categories", tag: TAG, description: "Add a category. Admin/HR.", body: CategoryRequestSchema });
documentRoute({ method: "patch", path: "/helpdesk/categories/{id}", tag: TAG, description: "Rename or deactivate a category. Admin/HR.", params: id, body: UpdateCategoryRequestSchema });
documentRoute({ method: "get", path: "/helpdesk/settings", tag: TAG, description: "Overdue threshold (hours). Admin/HR." });
documentRoute({ method: "put", path: "/helpdesk/settings", tag: TAG, description: "Set the overdue threshold. Admin/HR.", body: SettingsRequestSchema });
documentRoute({ method: "get", path: "/helpdesk/summary", tag: TAG, description: "Open/resolved per category and average resolution hours. Admin/HR.", response: SummarySchema });
documentRoute({ method: "post", path: "/helpdesk/tickets", tag: TAG, description: "Raise your own ticket.", body: RaiseTicketRequestSchema, response: TicketSchema });
documentRoute({ method: "get", path: "/helpdesk/tickets/me", tag: TAG, description: "Your tickets with status.", response: z.array(TicketSchema) });
documentRoute({ method: "get", path: "/helpdesk/tickets", tag: TAG, description: "HR queue: active tickets by default; filter status/categoryId, includeResolved. Overdue/unassigned flagged. Admin/HR.", query: z.object({ status: z.string().optional(), categoryId: z.string().optional(), includeResolved: z.enum(["true", "false"]).optional() }), response: z.array(TicketSchema) });
documentRoute({ method: "get", path: "/helpdesk/tickets/{id}", tag: TAG, description: "A ticket with its replies (requester or HR/Admin).", params: id, response: TicketSchema });
documentRoute({ method: "post", path: "/helpdesk/tickets/{id}/assign", tag: TAG, status: 200, description: "Assign to an active HR/Admin team member. Admin/HR.", params: id, body: AssignRequestSchema, response: TicketSchema });
documentRoute({ method: "post", path: "/helpdesk/tickets/{id}/replies", tag: TAG, status: 200, description: "Reply (HR replies are visible to the requester and stop the overdue clock).", params: id, body: ReplyRequestSchema, response: TicketSchema });
documentRoute({ method: "post", path: "/helpdesk/tickets/{id}/resolve", tag: TAG, status: 200, description: "Resolve. Admin/HR.", params: id, response: TicketSchema });
documentRoute({ method: "post", path: "/helpdesk/tickets/{id}/reopen", tag: TAG, status: 200, description: "The requester reopens a resolved ticket.", params: id, response: TicketSchema });
