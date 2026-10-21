import { z } from "zod";

// Request/response validation for resignation & exit (specs/009-resignation-exit).
export const ResignationStatusSchema = z.enum(["PENDING", "SERVING_NOTICE", "WITHDRAWN", "COMPLETED"]);

export const SubmitResignationRequestSchema = z.object({
  proposedLastDay: z.string().date(),
  reason: z.string().max(2000).optional(),
});
export type SubmitResignationRequest = z.infer<typeof SubmitResignationRequestSchema>;

export const AcknowledgeResignationRequestSchema = z.object({
  // Optional adjustment (e.g. to the notice period); defaults to the proposed day.
  confirmedLastDay: z.string().date().optional(),
});

export const ExitInterviewRequestSchema = z.object({ notes: z.string().min(1).max(10000) });

export const OffboardRequestSchema = z.object({
  // FR-006 override: offboard for access revocation even with clearance outstanding.
  force: z.boolean().optional(),
});

export const ResignationSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  proposedLastDay: z.string(),
  confirmedLastDay: z.string().nullable(),
  status: ResignationStatusSchema,
  reason: z.string().nullable(),
  acknowledgedAt: z.string().datetime().nullable(),
  // HR/Admin only
  exitInterviewNotes: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});

export const ExitTaskSchema = z.object({
  id: z.string(),
  ownerRole: z.enum(["IT", "FINANCE", "HR"]),
  description: z.string(),
  status: z.enum(["INCOMPLETE", "COMPLETE"]),
  completedById: z.string().nullable(),
  completedAt: z.string().datetime().nullable(),
});

export const ExitChecklistSchema = z.object({
  id: z.string(),
  resignationId: z.string(),
  closedAt: z.string().datetime().nullable(),
  reportsToReassign: z.array(z.object({ id: z.string(), name: z.string() })).nullable(),
  remainingCount: z.number().int(),
  tasks: z.array(ExitTaskSchema),
});
