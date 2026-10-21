import { z } from "zod";

// Request/response validation for expense claims (specs/014-asset-expense-management US3).
export const SubmitClaimFieldsSchema = z.object({
  // Multipart text fields arrive as strings.
  amount: z.coerce.number().positive().max(10_000_000),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).optional(),
});

export const RejectClaimRequestSchema = z.object({ reason: z.string().trim().min(3).max(1000) });

export const CategorySchema = z.object({ id: z.string(), name: z.string(), requiresReceipt: z.boolean(), active: z.boolean() });
export const CreateCategoryRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  requiresReceipt: z.boolean().default(true),
});
export const UpdateCategoryRequestSchema = z
  .object({ requiresReceipt: z.boolean().optional(), active: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export const ClaimSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  amount: z.number(),
  category: z.string(),
  description: z.string().nullable(),
  hasReceipt: z.boolean(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "PAID"]),
  approverId: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  decidedAt: z.string().datetime().nullable(),
  paidAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const PayoutsSchema = z.object({
  outstandingTotal: z.number(),
  outstandingCount: z.number().int(),
  outstanding: z.array(ClaimSchema),
});
