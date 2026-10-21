import { z } from "zod";

// Request/response validation for the HR helpdesk (specs/017-hr-helpdesk-ticketing).
export const TicketStatusSchema = z.enum(["OPEN", "ASSIGNED", "RESOLVED", "REOPENED"]);

export const RaiseTicketRequestSchema = z.object({
  categoryId: z.string(),
  subject: z.string().trim().min(3).max(150),
  description: z.string().trim().min(3).max(5000),
});

export const ReplyRequestSchema = z.object({ message: z.string().trim().min(1).max(5000) });
export const AssignRequestSchema = z.object({ assigneeId: z.string() });
export const CategoryRequestSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const UpdateCategoryRequestSchema = z
  .object({ name: z.string().trim().min(1).max(80).optional(), active: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export const SettingsRequestSchema = z.object({ overdueHours: z.number().int().min(1).max(24 * 30) });

export const TicketSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  categoryId: z.string(),
  category: z.string(),
  subject: z.string().nullable(),
  description: z.string(),
  status: TicketStatusSchema,
  assigneeId: z.string().nullable(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  overdue: z.boolean(),
  unassigned: z.boolean(),
  replies: z.array(z.object({ id: z.string(), authorId: z.string(), fromHr: z.boolean(), message: z.string(), createdAt: z.string().datetime() })).optional(),
});

export const SummarySchema = z.object({
  overdueHours: z.number().int(),
  categories: z.array(z.object({ categoryId: z.string(), name: z.string(), open: z.number().int(), resolved: z.number().int(), averageResolutionHours: z.number().nullable() })),
});
