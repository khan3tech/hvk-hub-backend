import { z } from "zod";

// Request/response validation for the asset inventory (specs/014-asset-expense-management).
export const AssetStatusSchema = z.enum(["UNASSIGNED", "ASSIGNED", "LOST", "DAMAGED"]);

export const CreateAssetRequestSchema = z.object({
  description: z.string().trim().min(1).max(200),
  identifier: z.string().trim().min(1).max(100),
});

export const AssignAssetRequestSchema = z.object({ employeeId: z.string() });
export const MarkAssetRequestSchema = z.object({ status: z.enum(["LOST", "DAMAGED"]) });

export const AssetSchema = z.object({
  id: z.string(),
  description: z.string(),
  identifier: z.string(),
  status: AssetStatusSchema,
  assignedTo: z.object({ employeeId: z.string(), assignedAt: z.string().datetime() }).nullable(),
});
