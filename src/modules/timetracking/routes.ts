import { Router } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./controller.js";
import {
  AddMembersRequestSchema,
  CreateEntryRequestSchema,
  CreateProjectRequestSchema,
  CreateTaskRequestSchema,
  EntriesQuerySchema,
  EntrySchema,
  ProjectDetailSchema,
  ProjectSchema,
  ReasonRequestSchema,
  ReportQuerySchema,
  ReportSchema,
  StartTimerRequestSchema,
  StopTimerRequestSchema,
  SubmitRequestSchema,
  TaskSchema,
  TeamQuerySchema,
  TeamRowSchema,
  TimerSchema,
  TrimTimerRequestSchema,
  UpdateEntryRequestSchema,
  UpdateProjectRequestSchema,
  UpdateTaskRequestSchema,
  UpdateTimerRequestSchema,
  WeekQuerySchema,
  WeekSchema,
} from "./schema.js";

// Contract: specs/028-time-tracker/contracts/time-tracker-api.md. Ownership, direct-report and
// week-lock rules (FR-013/014/019) are enforced in service.ts.
export const timeRouter = Router();
timeRouter.use(authenticate);
const PROJECT_ADMINS = authorize("ADMIN", "HR", "MANAGER");
const HR = authorize("ADMIN", "HR");
const TAG = "Time Tracker";

timeRouter.get("/projects", handle(c.listProjects));
timeRouter.post("/projects", PROJECT_ADMINS, validate(CreateProjectRequestSchema), handle(c.createProject));
timeRouter.get("/projects/:id", handle(c.getProject));
timeRouter.patch("/projects/:id", PROJECT_ADMINS, validate(UpdateProjectRequestSchema), handle(c.updateProject));
timeRouter.post("/projects/:id/tasks", PROJECT_ADMINS, validate(CreateTaskRequestSchema), handle(c.createTask));
timeRouter.patch("/tasks/:id", PROJECT_ADMINS, validate(UpdateTaskRequestSchema), handle(c.updateTask));
timeRouter.post("/projects/:id/members", PROJECT_ADMINS, validate(AddMembersRequestSchema), handle(c.addMembers));
timeRouter.delete("/projects/:id/members/:employeeId", PROJECT_ADMINS, handle(c.removeMember));

timeRouter.get("/entries", handle(c.listEntries));
timeRouter.post("/entries", validate(CreateEntryRequestSchema), handle(c.createEntry));
timeRouter.patch("/entries/:id", validate(UpdateEntryRequestSchema), handle(c.updateEntry));
timeRouter.delete("/entries/:id", handle(c.deleteEntry));

timeRouter.get("/timer", handle(c.getTimer));
timeRouter.post("/timer/start", validate(StartTimerRequestSchema), handle(c.startTimer));
timeRouter.post("/timer/stop", validate(StopTimerRequestSchema), handle(c.stopTimer));
timeRouter.patch("/timer", validate(UpdateTimerRequestSchema), handle(c.updateTimer));
timeRouter.post("/timer/trim", validate(TrimTimerRequestSchema), handle(c.trimTimer));
timeRouter.delete("/timer", handle(c.discardTimer));

timeRouter.get("/timesheets/week", handle(c.getWeek));
timeRouter.post("/timesheets/submit", validate(SubmitRequestSchema), handle(c.submitWeek));
timeRouter.get("/timesheets/team", PROJECT_ADMINS, handle(c.teamWeek));
timeRouter.post("/timesheets/:id/approve", PROJECT_ADMINS, handle(c.approve));
timeRouter.post("/timesheets/:id/reject", PROJECT_ADMINS, validate(ReasonRequestSchema), handle(c.reject));
timeRouter.post("/timesheets/:id/reopen", HR, validate(ReasonRequestSchema), handle(c.reopen));

timeRouter.get("/reports/hours", handle(c.hoursReport));

const id = z.object({ id: z.string() });
const p = "/time";
documentRoute({ method: "get", path: `${p}/projects`, tag: TAG, description: "Projects you can see (members; Manager: owned + member; HR/Admin: all). mine=true → only ones you can log to.", query: z.object({ status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).optional(), mine: z.enum(["true", "false"]).optional() }), response: z.array(ProjectSchema) });
documentRoute({ method: "post", path: `${p}/projects`, tag: TAG, description: "Create a project (code unique per org). Admin/HR/Manager.", body: CreateProjectRequestSchema, response: ProjectDetailSchema });
documentRoute({ method: "get", path: `${p}/projects/{id}`, tag: TAG, description: "A project with tasks and members.", params: id, response: ProjectDetailSchema });
documentRoute({ method: "patch", path: `${p}/projects/{id}`, tag: TAG, description: "Rename, change client/billable, archive. Owner or HR/Admin.", params: id, body: UpdateProjectRequestSchema, response: ProjectDetailSchema });
documentRoute({ method: "post", path: `${p}/projects/{id}/tasks`, tag: TAG, description: "Add a task. Owner or HR/Admin.", params: id, body: CreateTaskRequestSchema, response: TaskSchema });
documentRoute({ method: "patch", path: `${p}/tasks/{id}`, tag: TAG, description: "Rename or archive a task. Owner or HR/Admin.", params: id, body: UpdateTaskRequestSchema, response: TaskSchema });
documentRoute({ method: "post", path: `${p}/projects/{id}/members`, tag: TAG, status: 200, description: "Add active employees as members. Owner or HR/Admin.", params: id, body: AddMembersRequestSchema, response: ProjectDetailSchema });
documentRoute({ method: "delete", path: `${p}/projects/{id}/members/{employeeId}`, tag: TAG, status: 200, description: "Remove a member. Owner or HR/Admin.", params: z.object({ id: z.string(), employeeId: z.string() }), response: ProjectDetailSchema });
documentRoute({ method: "get", path: `${p}/entries`, tag: TAG, description: "Time entries in a date range (default this week; own, or a visible employee's).", query: EntriesQuerySchema, response: z.array(EntrySchema) });
documentRoute({ method: "post", path: `${p}/entries`, tag: TAG, description: "Log time on a task (member, active project, open week, ≤24h/day).", body: CreateEntryRequestSchema, response: EntrySchema });
documentRoute({ method: "patch", path: `${p}/entries/{id}`, tag: TAG, description: "Edit your own entry in an open week.", params: id, body: UpdateEntryRequestSchema, response: EntrySchema });
documentRoute({ method: "delete", path: `${p}/entries/{id}`, tag: TAG, status: 204, description: "Delete your own entry in an open week.", params: id });
documentRoute({ method: "get", path: `${p}/timer`, tag: TAG, description: "Your running timer, or null.", response: z.object({ timer: TimerSchema.nullable() }) });
documentRoute({ method: "post", path: `${p}/timer/start`, tag: TAG, description: "Start a timer (one per employee). switch=true stops and saves the running one first.", body: StartTimerRequestSchema, response: z.object({ timer: TimerSchema, stoppedEntry: EntrySchema.nullable() }) });
documentRoute({ method: "post", path: `${p}/timer/stop`, tag: TAG, status: 200, description: "Stop your timer and save it as an entry (flagged if overnight or >12h).", body: StopTimerRequestSchema, response: z.object({ entry: EntrySchema }) });
documentRoute({ method: "patch", path: `${p}/timer`, tag: TAG, description: "Update the running timer's note.", body: UpdateTimerRequestSchema, response: z.object({ timer: TimerSchema }) });
documentRoute({ method: "delete", path: `${p}/timer`, tag: TAG, status: 204, description: "Discard your running timer without saving." });
documentRoute({ method: "post", path: `${p}/timer/trim`, tag: TAG, status: 200, description: "029: remove idle minutes from your running timer (moves its start later, never past now).", body: TrimTimerRequestSchema, response: z.object({ timer: TimerSchema }) });
documentRoute({ method: "get", path: `${p}/timesheets/week`, tag: TAG, description: "A week's timesheet (Mon–Sun) with entries, totals and allowed actions.", query: WeekQuerySchema, response: WeekSchema });
documentRoute({ method: "post", path: `${p}/timesheets/submit`, tag: TAG, status: 200, description: "Submit your week for approval (locks it).", body: SubmitRequestSchema, response: WeekSchema });
documentRoute({ method: "get", path: `${p}/timesheets/team`, tag: TAG, description: "Each direct report's (HR/Admin: everyone's) status and total for a week.", query: TeamQuerySchema, response: z.array(TeamRowSchema) });
documentRoute({ method: "post", path: `${p}/timesheets/{id}/approve`, tag: TAG, status: 200, description: "Approve a submitted timesheet. Reporting manager or HR/Admin, never your own.", params: id, response: WeekSchema });
documentRoute({ method: "post", path: `${p}/timesheets/{id}/reject`, tag: TAG, status: 200, description: "Reject with a reason (unlocks the week).", params: id, body: ReasonRequestSchema, response: WeekSchema });
documentRoute({ method: "post", path: `${p}/timesheets/{id}/reopen`, tag: TAG, status: 200, description: "Reopen an approved timesheet to draft with a reason. Admin/HR.", params: id, body: ReasonRequestSchema, response: WeekSchema });
documentRoute({ method: "get", path: `${p}/reports/hours`, tag: TAG, description: "Hours by project/employee/task with billable split, scoped to what you can see.", query: ReportQuerySchema, response: ReportSchema });
