import { z } from "zod";

// Request/response validation for the payroll module.
// See specs/004-payroll/spec.md for the functional requirements.
export const SalaryStructureSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  basic: z.number().nonnegative(),
  hra: z.number().nonnegative(),
  allowances: z.record(z.string(), z.number()),
  effectiveFrom: z.string().date(),
  // Server-assigned (defaults to the org's single currency, "INR" for v0.1 — see
  // 026-global-multi-currency-payroll for per-org configurability). Never client-settable.
  currency: z.string().nullable().optional(),
});
export type SalaryStructure = z.infer<typeof SalaryStructureSchema>;

export const SetSalaryStructureRequestSchema = SalaryStructureSchema.omit({
  id: true,
  employeeId: true,
  currency: true,
});
export type SetSalaryStructureRequest = z.infer<typeof SetSalaryStructureRequestSchema>;

export const RunPayrollRequestSchema = z.object({
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2000),
});
export type RunPayrollRequest = z.infer<typeof RunPayrollRequestSchema>;

export const PayslipSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int(),
  earnings: z.record(z.string(), z.number()),
  deductions: z.record(z.string(), z.number()),
  netPay: z.number(),
  // Server-assigned at generation time, immutable thereafter (defaults to "INR" for v0.1).
  currency: z.string().nullable().optional(),
});
export type Payslip = z.infer<typeof PayslipSchema>;

export const RunPayrollResponseSchema = z.object({
  periodMonth: z.number().int(),
  periodYear: z.number().int(),
  payslipCount: z.number().int(),
  skipped: z.array(z.object({ employeeId: z.string(), reason: z.string() })),
});
export type RunPayrollResponse = z.infer<typeof RunPayrollResponseSchema>;

export const PayslipListResponseSchema = z.array(PayslipSchema);
