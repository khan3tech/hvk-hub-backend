import { z } from "zod";

// Request/response validation for the onboarding module (specs/007-employee-onboarding).
export const OnboardingOwnerRoleSchema = z.enum(["HR", "MANAGER", "IT", "EMPLOYEE"]);
export type OnboardingOwnerRole = z.infer<typeof OnboardingOwnerRoleSchema>;

export const TemplateTaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  ownerRole: OnboardingOwnerRoleSchema,
  order: z.number().int(),
});

export const CreateTemplateTaskRequestSchema = z.object({
  description: z.string().min(1).max(500),
  ownerRole: OnboardingOwnerRoleSchema.optional(),
  order: z.number().int().min(0).optional(),
});
export type CreateTemplateTaskRequest = z.infer<typeof CreateTemplateTaskRequestSchema>;

export const UpdateTemplateTaskRequestSchema = z
  .object({
    description: z.string().min(1).max(500).optional(),
    ownerRole: OnboardingOwnerRoleSchema.optional(),
    order: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export type UpdateTemplateTaskRequest = z.infer<typeof UpdateTemplateTaskRequestSchema>;

export const AddTaskRequestSchema = z.object({
  description: z.string().min(1).max(500),
  ownerRole: OnboardingOwnerRoleSchema.optional(),
  ownerEmployeeId: z.string().optional(),
});
export type AddTaskRequest = z.infer<typeof AddTaskRequestSchema>;

export const UpdateTaskRequestSchema = z
  .object({
    description: z.string().min(1).max(500).optional(),
    ownerRole: OnboardingOwnerRoleSchema.optional(),
    // null clears an explicit reassignment and falls back to ownerRole routing.
    ownerEmployeeId: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequestSchema>;

export const OnboardingTaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  ownerRole: OnboardingOwnerRoleSchema,
  ownerEmployeeId: z.string().nullable(),
  status: z.enum(["INCOMPLETE", "COMPLETE"]),
  completedById: z.string().nullable(),
  completedAt: z.string().datetime().nullable(),
});

export const ChecklistSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  status: z.enum(["IN_PROGRESS", "COMPLETE"]),
  completedCount: z.number().int(),
  totalCount: z.number().int(),
  tasks: z.array(OnboardingTaskSchema),
});

export const OverviewEntrySchema = z.object({
  checklistId: z.string(),
  employeeId: z.string(),
  name: z.string(),
  dateOfJoining: z.string().datetime(),
  daysSinceJoining: z.number().int(),
  completedCount: z.number().int(),
  totalCount: z.number().int(),
  stalled: z.boolean(),
});
