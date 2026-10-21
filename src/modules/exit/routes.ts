import { Router } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./controller.js";
import {
  AcknowledgeResignationRequestSchema,
  ExitChecklistSchema,
  ExitInterviewRequestSchema,
  OffboardRequestSchema,
  ResignationSchema,
  SubmitResignationRequestSchema,
} from "./schema.js";

// Contract: specs/009-resignation-exit/contracts/exit-api.md. "Their manager" scoping for
// acknowledge/view is enforced in service.ts.
export const exitRouter = Router();
const HR = authorize("ADMIN", "HR");
const TAG = "Resignation & Exit";
const idp = z.object({ id: z.string() });

exitRouter.post("/resignations", authenticate, validate(SubmitResignationRequestSchema), handle(c.submit));
exitRouter.get("/resignations/me", authenticate, handle(c.mine));
exitRouter.get("/resignations", authenticate, authorize("ADMIN", "HR", "MANAGER"), handle(c.list));
exitRouter.get("/resignations/:id", authenticate, handle(c.get));
exitRouter.post("/resignations/:id/acknowledge", authenticate, authorize("ADMIN", "HR", "MANAGER"), validate(AcknowledgeResignationRequestSchema), handle(c.acknowledge));
exitRouter.post("/resignations/:id/withdraw", authenticate, HR, handle(c.withdraw));
exitRouter.put("/resignations/:id/exit-interview", authenticate, HR, validate(ExitInterviewRequestSchema), handle(c.exitInterview));
exitRouter.get("/resignations/:id/checklist", authenticate, HR, handle(c.checklist));
exitRouter.post("/resignations/:id/offboard", authenticate, HR, validate(OffboardRequestSchema), handle(c.offboard));
exitRouter.post("/tasks/:id/complete", authenticate, HR, handle(c.completeTask));

documentRoute({ method: "post", path: "/exit/resignations", tag: TAG, description: "Submit your resignation with a proposed last working day (one active at a time).", body: SubmitResignationRequestSchema, response: ResignationSchema });
documentRoute({ method: "get", path: "/exit/resignations/me", tag: TAG, description: "Your own resignations and their status.", response: z.array(ResignationSchema) });
documentRoute({ method: "get", path: "/exit/resignations", tag: TAG, description: "Resignations: all for HR/Admin, direct reports' for a Manager.", query: z.object({ status: z.string().optional() }), response: z.array(ResignationSchema) });
documentRoute({ method: "get", path: "/exit/resignations/{id}", tag: TAG, description: "One resignation (employee, their manager, HR/Admin; notes HR/Admin only).", params: idp, response: ResignationSchema });
documentRoute({ method: "post", path: "/exit/resignations/{id}/acknowledge", tag: TAG, status: 200, description: "Acknowledge (their Manager or HR/Admin), optionally adjusting the last day; starts notice and creates the exit checklist.", params: idp, body: AcknowledgeResignationRequestSchema, response: ResignationSchema });
documentRoute({ method: "post", path: "/exit/resignations/{id}/withdraw", tag: TAG, status: 200, description: "Mark withdrawn and close the checklist; the employee stays active. Admin/HR.", params: idp, response: ResignationSchema });
documentRoute({ method: "put", path: "/exit/resignations/{id}/exit-interview", tag: TAG, description: "Record exit-interview notes (HR/Admin only, never shown to others).", params: idp, body: ExitInterviewRequestSchema, response: ResignationSchema });
documentRoute({ method: "get", path: "/exit/resignations/{id}/checklist", tag: TAG, description: "Exit clearance tasks, what remains, and direct reports to reassign. Admin/HR.", params: idp, response: ExitChecklistSchema });
documentRoute({ method: "post", path: "/exit/resignations/{id}/offboard", tag: TAG, status: 200, description: "Offboard once clearance is complete (or force for access revocation); revokes access. Admin/HR.", params: idp, body: OffboardRequestSchema, response: ResignationSchema });
documentRoute({ method: "post", path: "/exit/tasks/{id}/complete", tag: TAG, status: 200, description: "Complete a clearance task on behalf of its owner team. Admin/HR.", params: idp, response: ExitChecklistSchema });
