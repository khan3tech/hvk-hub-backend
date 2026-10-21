import { Router } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./controller.js";
import {
  CorrectionSchema,
  CreateCycleRequestSchema,
  CreateGoalRequestSchema,
  CycleStatusSchema,
  GoalSchema,
  ManagerReviewDraftSchema,
  RequestChangesSchema,
  ReviewSchema,
  ReviseGoalRequestSchema,
  SelfReflectionSchema,
  UpdateProgressSchema,
} from "./schema.js";

// Contract: specs/012-performance-management/contracts/performance-api.md. Owner / current
// manager / reviewer scoping is enforced in service.ts.
export const performanceRouter = Router();
performanceRouter.use(authenticate);
const HR = authorize("ADMIN", "HR");
const TAG = "Performance";

performanceRouter.post("/goals", validate(CreateGoalRequestSchema), handle(c.createGoal));
performanceRouter.get("/goals/me", handle(c.myGoals));
performanceRouter.get("/employees/:employeeId/goals", handle(c.employeeGoals));
performanceRouter.get("/employees/:employeeId/history", handle(c.history));
performanceRouter.post("/goals/:id/approve", handle(c.approveGoal));
performanceRouter.post("/goals/:id/request-changes", validate(RequestChangesSchema), handle(c.requestChanges));
performanceRouter.patch("/goals/:id", validate(ReviseGoalRequestSchema), handle(c.reviseGoal));
performanceRouter.post("/goals/:id/progress", validate(UpdateProgressSchema), handle(c.updateProgress));

performanceRouter.post("/cycles", HR, validate(CreateCycleRequestSchema), handle(c.createCycle));
performanceRouter.get("/cycles", HR, handle(c.listCycles));
performanceRouter.get("/cycles/:id/status", HR, handle(c.cycleStatus));

performanceRouter.get("/reviews/to-do", handle(c.reviewsToDo));
performanceRouter.get("/reviews/:id", handle(c.getReview));
performanceRouter.patch("/reviews/:id", validate(ManagerReviewDraftSchema), handle(c.saveDraft));
performanceRouter.put("/reviews/:id/self-reflection", validate(SelfReflectionSchema), handle(c.selfReflection));
performanceRouter.post("/reviews/:id/finalize", handle(c.finalize));
performanceRouter.post("/reviews/:id/corrections", HR, validate(CorrectionSchema), handle(c.correct));

const id = z.object({ id: z.string() });
const emp = z.object({ employeeId: z.string() });
documentRoute({ method: "post", path: "/performance/goals", tag: TAG, description: "Propose a goal (pending your manager's approval).", body: CreateGoalRequestSchema, response: GoalSchema });
documentRoute({ method: "get", path: "/performance/goals/me", tag: TAG, description: "Your goals.", response: z.array(GoalSchema) });
documentRoute({ method: "get", path: "/performance/employees/{employeeId}/goals", tag: TAG, description: "An employee's goals (self, current manager, HR/Admin).", params: emp, response: z.array(GoalSchema) });
documentRoute({ method: "get", path: "/performance/employees/{employeeId}/history", tag: TAG, description: "Full goal and review history (self, current manager, HR/Admin).", params: emp });
documentRoute({ method: "post", path: "/performance/goals/{id}/approve", tag: TAG, status: 200, description: "Approve a pending goal (current manager or HR/Admin).", params: id, response: GoalSchema });
documentRoute({ method: "post", path: "/performance/goals/{id}/request-changes", tag: TAG, status: 200, description: "Request changes on a pending goal with a note.", params: id, body: RequestChangesSchema, response: GoalSchema });
documentRoute({ method: "patch", path: "/performance/goals/{id}", tag: TAG, description: "Owner revises and resubmits a goal.", params: id, body: ReviseGoalRequestSchema, response: GoalSchema });
documentRoute({ method: "post", path: "/performance/goals/{id}/progress", tag: TAG, status: 200, description: "Owner updates progress on an active goal until its target date (completed=true closes it).", params: id, body: UpdateProgressSchema, response: GoalSchema });
documentRoute({ method: "post", path: "/performance/cycles", tag: TAG, description: "Open a review cycle (company, department, or explicit employees); creates a review per covered employee. Admin/HR.", body: CreateCycleRequestSchema });
documentRoute({ method: "get", path: "/performance/cycles", tag: TAG, description: "Review cycles. Admin/HR." });
documentRoute({ method: "get", path: "/performance/cycles/{id}/status", tag: TAG, description: "Completed vs pending vs overdue reviews. Admin/HR.", params: id, response: CycleStatusSchema });
documentRoute({ method: "get", path: "/performance/reviews/to-do", tag: TAG, description: "In-progress reviews the caller must write (follows current reporting lines).", response: z.array(ReviewSchema) });
documentRoute({ method: "get", path: "/performance/reviews/{id}", tag: TAG, description: "A review with the period's goals (employee, reviewer, HR/Admin).", params: id, response: ReviewSchema });
documentRoute({ method: "patch", path: "/performance/reviews/{id}", tag: TAG, description: "Reviewer saves a draft rating (1-5) and comments.", params: id, body: ManagerReviewDraftSchema, response: ReviewSchema });
documentRoute({ method: "put", path: "/performance/reviews/{id}/self-reflection", tag: TAG, description: "The reviewed employee adds self-reflection before finalization.", params: id, body: SelfReflectionSchema, response: ReviewSchema });
documentRoute({ method: "post", path: "/performance/reviews/{id}/finalize", tag: TAG, status: 200, description: "Reviewer finalizes (rating required); then immutable.", params: id, response: ReviewSchema });
documentRoute({ method: "post", path: "/performance/reviews/{id}/corrections", tag: TAG, status: 200, description: "HR/Admin correct a final review with a recorded reason.", params: id, body: CorrectionSchema, response: ReviewSchema });
