import { Router } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./controller.js";
import {
  AddTaskRequestSchema,
  ChecklistSchema,
  CreateTemplateTaskRequestSchema,
  OnboardingTaskSchema,
  OverviewEntrySchema,
  TemplateTaskSchema,
  UpdateTaskRequestSchema,
  UpdateTemplateTaskRequestSchema,
} from "./schema.js";

// Contract: specs/007-employee-onboarding/contracts/onboarding-api.md. Task-owner and
// checklist-viewer scoping (FR-004, SC-002) is enforced in service.ts.
export const onboardingRouter = Router();
const HR = authorize("ADMIN", "HR");
const TAG = "Onboarding";
const id = z.object({ id: z.string() });
const emp = z.object({ employeeId: z.string() });

onboardingRouter.get("/templates", authenticate, HR, handle(c.listTemplate));
onboardingRouter.post("/templates", authenticate, HR, validate(CreateTemplateTaskRequestSchema), handle(c.addTemplateTask));
onboardingRouter.patch("/templates/:id", authenticate, HR, validate(UpdateTemplateTaskRequestSchema), handle(c.updateTemplateTask));
onboardingRouter.delete("/templates/:id", authenticate, HR, handle(c.removeTemplateTask));

onboardingRouter.get("/overview", authenticate, HR, handle(c.getOverview));
onboardingRouter.get("/me", authenticate, handle(c.getMyChecklist));
onboardingRouter.get("/tasks/me", authenticate, handle(c.listMyTasks));
onboardingRouter.post("/checklists/:employeeId", authenticate, HR, handle(c.attachChecklist));
onboardingRouter.get("/checklists/:employeeId", authenticate, handle(c.getChecklist));
onboardingRouter.post("/checklists/:employeeId/tasks", authenticate, HR, validate(AddTaskRequestSchema), handle(c.addTask));
onboardingRouter.patch("/tasks/:id", authenticate, HR, validate(UpdateTaskRequestSchema), handle(c.updateTask));
onboardingRouter.delete("/tasks/:id", authenticate, HR, handle(c.removeTask));
onboardingRouter.post("/tasks/:id/complete", authenticate, handle(c.completeTask));

documentRoute({ method: "get", path: "/onboarding/templates", tag: TAG, description: "The standard task template new checklists copy (seeded with defaults on first use). Admin/HR.", response: z.array(TemplateTaskSchema) });
documentRoute({ method: "post", path: "/onboarding/templates", tag: TAG, description: "Add a standard task (affects future checklists only). Admin/HR.", body: CreateTemplateTaskRequestSchema, response: TemplateTaskSchema });
documentRoute({ method: "patch", path: "/onboarding/templates/{id}", tag: TAG, description: "Edit a standard task. Admin/HR.", params: id, body: UpdateTemplateTaskRequestSchema, response: TemplateTaskSchema });
documentRoute({ method: "delete", path: "/onboarding/templates/{id}", tag: TAG, status: 204, description: "Remove a standard task. Admin/HR.", params: id });
documentRoute({ method: "get", path: "/onboarding/overview", tag: TAG, description: "Active employees with an in-progress checklist: progress, days since joining, stalled flag. Admin/HR.", response: z.array(OverviewEntrySchema) });
documentRoute({ method: "get", path: "/onboarding/me", tag: TAG, description: "The caller's own onboarding checklist.", response: ChecklistSchema });
documentRoute({ method: "get", path: "/onboarding/tasks/me", tag: TAG, description: "Incomplete onboarding tasks routed to the caller, across all checklists." });
documentRoute({ method: "post", path: "/onboarding/checklists/{employeeId}", tag: TAG, description: "Attach a checklist to an existing employee without one (409 if present). Admin/HR.", params: emp, response: ChecklistSchema });
documentRoute({ method: "get", path: "/onboarding/checklists/{employeeId}", tag: TAG, description: "An employee's checklist: HR/Admin, the hire, their manager, or a reassigned owner.", params: emp, response: ChecklistSchema });
documentRoute({ method: "post", path: "/onboarding/checklists/{employeeId}/tasks", tag: TAG, description: "Add a one-off task to this employee's checklist only. Admin/HR.", params: emp, body: AddTaskRequestSchema, response: OnboardingTaskSchema });
documentRoute({ method: "patch", path: "/onboarding/tasks/{id}", tag: TAG, description: "Edit or reassign a task (owner role and/or a specific active employee). Admin/HR.", params: id, body: UpdateTaskRequestSchema, response: OnboardingTaskSchema });
documentRoute({ method: "delete", path: "/onboarding/tasks/{id}", tag: TAG, status: 204, description: "Remove a task from one checklist. Admin/HR.", params: id });
documentRoute({ method: "post", path: "/onboarding/tasks/{id}/complete", tag: TAG, status: 200, description: "Mark a task complete (its owner or Admin/HR); records who and when.", params: id, response: OnboardingTaskSchema });
