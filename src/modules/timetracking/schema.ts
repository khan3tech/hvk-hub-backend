import { z } from "zod";
import { isIsoDate } from "./week.js";

// Request/response validation for the time tracker (specs/028-time-tracker,
// contracts/time-tracker-api.md).
const isoDate = z.string().refine(isIsoDate, "Use a YYYY-MM-DD date.");
const minutes = z.number().int().min(1, "Duration must be at least 1 minute.").max(1440, "Duration can't exceed 24 hours.");
const note = z.string().trim().max(1000);
const reason = z.string().trim().min(10, "Give a reason of at least 10 characters.").max(1000);

export const ProjectStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);
export const TimesheetStatusSchema = z.enum(["NOT_STARTED", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]);

export const CreateProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, - or _.")
    .transform((v) => v.toUpperCase()),
  clientName: z.string().trim().max(120).optional(),
  billable: z.boolean().optional(),
});

export const UpdateProjectRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    clientName: z.string().trim().max(120).nullable().optional(),
    billable: z.boolean().optional(),
    status: ProjectStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export const CreateTaskRequestSchema = z.object({ name: z.string().trim().min(1).max(120) });
export const UpdateTaskRequestSchema = z
  .object({ name: z.string().trim().min(1).max(120).optional(), status: ProjectStatusSchema.optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export const AddMembersRequestSchema = z.object({ employeeIds: z.array(z.string()).min(1).max(200) });

export const CreateEntryRequestSchema = z.object({
  taskId: z.string(),
  date: isoDate,
  minutes,
  note: note.optional(),
  billable: z.boolean().optional(),
});

export const UpdateEntryRequestSchema = z
  .object({
    taskId: z.string().optional(),
    date: isoDate.optional(),
    minutes: minutes.optional(),
    note: note.nullable().optional(),
    billable: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export const EntriesQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  employeeId: z.string().optional(),
});

export const StartTimerRequestSchema = z.object({ taskId: z.string(), note: note.optional(), switch: z.boolean().optional() });
export const StopTimerRequestSchema = z.object({ note: note.optional() });
export const UpdateTimerRequestSchema = z.object({ note: note });

export const WeekQuerySchema = z.object({ weekStart: isoDate.optional(), employeeId: z.string().optional() });
export const SubmitRequestSchema = z.object({ weekStart: isoDate });
export const TeamQuerySchema = z.object({ weekStart: isoDate.optional(), status: TimesheetStatusSchema.optional() });
export const ReasonRequestSchema = z.object({ reason });

export const ReportQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  groupBy: z.enum(["project", "employee", "task"]).default("project"),
  projectId: z.string().optional(),
  employeeId: z.string().optional(),
  approvedOnly: z.enum(["true", "false"]).optional(),
});

// --- Responses (documentation; services return these shapes) ---
export const TaskSchema = z.object({ id: z.string(), projectId: z.string(), name: z.string(), status: ProjectStatusSchema });
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  clientName: z.string().nullable(),
  billable: z.boolean(),
  status: ProjectStatusSchema,
  ownerId: z.string(),
  canManage: z.boolean(),
  memberCount: z.number().int(),
  createdAt: z.string().datetime(),
});
export const ProjectDetailSchema = ProjectSchema.extend({
  tasks: z.array(TaskSchema),
  members: z.array(z.object({ employeeId: z.string(), name: z.string() })),
});
export const EntrySchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  projectCode: z.string(),
  taskId: z.string(),
  taskName: z.string(),
  date: z.string(),
  minutes: z.number().int(),
  note: z.string().nullable(),
  billable: z.boolean(),
  source: z.enum(["MANUAL", "TIMER"]),
  flagged: z.boolean(),
  locked: z.boolean(),
});
export const TimerSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  taskName: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  startedAt: z.string().datetime(),
  note: z.string().nullable(),
  elapsedSeconds: z.number().int(),
});
export const WeekSchema = z.object({
  employeeId: z.string(),
  employeeName: z.string(),
  weekStart: z.string(),
  weekEnd: z.string(),
  status: TimesheetStatusSchema,
  timesheetId: z.string().nullable(),
  totalMinutes: z.number().int(),
  billableMinutes: z.number().int(),
  flaggedCount: z.number().int(),
  days: z.array(z.object({ date: z.string(), minutes: z.number().int() })),
  entries: z.array(EntrySchema),
  submittedAt: z.string().datetime().nullable(),
  decidedAt: z.string().datetime().nullable(),
  decidedByName: z.string().nullable(),
  reason: z.string().nullable(),
  canEdit: z.boolean(),
  canSubmit: z.boolean(),
  canDecide: z.boolean(),
  canReopen: z.boolean(),
});
export const TeamRowSchema = z.object({
  employeeId: z.string(),
  employeeName: z.string(),
  weekStart: z.string(),
  status: TimesheetStatusSchema,
  timesheetId: z.string().nullable(),
  totalMinutes: z.number().int(),
  flaggedCount: z.number().int(),
});
export const ReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  groupBy: z.enum(["project", "employee", "task"]),
  totals: z.object({ totalMinutes: z.number().int(), billableMinutes: z.number().int(), nonBillableMinutes: z.number().int() }),
  rows: z.array(
    z.object({ key: z.string(), label: z.string(), totalMinutes: z.number().int(), billableMinutes: z.number().int(), nonBillableMinutes: z.number().int() }),
  ),
});
