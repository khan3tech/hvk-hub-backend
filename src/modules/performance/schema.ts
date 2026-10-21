import { z } from "zod";

// Request/response validation for goals, reviews and review cycles
// (specs/012-performance-management).

// v1.1 fixed scale (Assumptions).
export const RATING_SCALE = {
  "1": "Needs improvement",
  "2": "Partially meets expectations",
  "3": "Meets expectations",
  "4": "Exceeds expectations",
  "5": "Outstanding",
} as const;
export const RatingSchema = z.enum(["1", "2", "3", "4", "5"]);

export const CreateGoalRequestSchema = z.object({
  description: z.string().trim().min(3).max(2000),
  targetDate: z.string().date(),
});
export const ReviseGoalRequestSchema = CreateGoalRequestSchema.partial().refine((v) => Object.keys(v).length > 0, { message: "Nothing to change." });
export const RequestChangesSchema = z.object({ note: z.string().trim().min(3).max(2000) });
export const UpdateProgressSchema = z
  .object({
    progressPercent: z.number().int().min(0).max(100).optional(),
    progress: z.string().max(2000).optional(),
    completed: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Provide progressPercent, progress or completed." });

export const GoalSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  description: z.string(),
  targetDate: z.string(),
  status: z.enum(["PENDING_APPROVAL", "ACTIVE", "CHANGES_REQUESTED", "COMPLETED"]),
  progress: z.string().nullable(),
  progressPercent: z.number().int().nullable(),
  changeRequestNote: z.string().nullable(),
});

export const CreateCycleRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    startDate: z.string().date(),
    endDate: z.string().date(),
    scopeType: z.enum(["COMPANY", "DEPARTMENT"]).default("COMPANY"),
    departmentId: z.string().optional(),
    // Optional explicit set of employees (FR-008); otherwise the scope decides.
    employeeIds: z.array(z.string()).min(1).optional(),
  })
  .refine((v) => v.startDate <= v.endDate, { message: "startDate must be on or before endDate.", path: ["endDate"] })
  .refine((v) => v.scopeType !== "DEPARTMENT" || Boolean(v.departmentId), { message: "departmentId is required for a DEPARTMENT cycle.", path: ["departmentId"] });

export const ManagerReviewDraftSchema = z
  .object({ rating: RatingSchema.optional(), managerComments: z.string().max(10000).optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to save." });
export const SelfReflectionSchema = z.object({ employeeComments: z.string().trim().min(1).max(10000) });
export const CorrectionSchema = z
  .object({ rating: RatingSchema.optional(), managerComments: z.string().max(10000).optional(), reason: z.string().trim().min(3).max(1000) })
  .refine((v) => v.rating !== undefined || v.managerComments !== undefined, { message: "Correct the rating and/or managerComments." });

export const ReviewSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  reviewCycleId: z.string(),
  managerId: z.string(),
  previousManagerId: z.string().nullable(),
  rating: RatingSchema.nullable(),
  ratingLabel: z.string().nullable(),
  managerComments: z.string().nullable(),
  employeeComments: z.string().nullable(),
  status: z.enum(["IN_PROGRESS", "FINAL"]),
  overdue: z.boolean(),
  goals: z.array(GoalSchema).optional(),
});

export const CycleStatusSchema = z.object({
  cycleId: z.string(),
  completed: z.number().int(),
  pending: z.number().int(),
  overdue: z.number().int(),
  notRequired: z.number().int(),
  reviews: z.array(z.object({ reviewId: z.string(), employeeId: z.string(), employeeName: z.string(), managerId: z.string(), status: z.string(), overdue: z.boolean(), required: z.boolean() })),
});
