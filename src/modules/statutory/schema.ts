import { z } from "zod";

// Request/response validation for statutory components, exemptions and compliance reports
// (specs/010-statutory-payroll-tax). Rule configs are validated per rule type (FR-001).
export const SalaryBaseSchema = z.enum(["BASIC", "BASIC_PLUS_HRA", "GROSS"]);
export type SalaryBase = z.infer<typeof SalaryBaseSchema>;

export const FlatRuleSchema = z.object({ amount: z.number().nonnegative() });
export const PercentageRuleSchema = z.object({
  percent: z.number().min(0).max(100),
  base: SalaryBaseSchema,
  // Optional monthly ceiling on the deduction (e.g. a capped contribution).
  cap: z.number().positive().optional(),
});
export const BracketRuleSchema = z.object({
  base: SalaryBaseSchema,
  // ANNUAL: brackets apply to base x 12 and the result is spread over 12 months.
  period: z.enum(["MONTHLY", "ANNUAL"]),
  brackets: z
    .array(z.object({ upTo: z.number().positive().nullable(), percent: z.number().min(0).max(100) }))
    .min(1)
    .refine(
      (b) =>
        b.every((x, i) => i === b.length - 1 || (x.upTo !== null && (i === 0 || x.upTo > (b[i - 1]!.upTo ?? Infinity)))) &&
        b[b.length - 1]!.upTo === null,
      { message: "Brackets must ascend by upTo and end with an open-ended (upTo: null) bracket." },
    ),
});

export const RuleSchema = z.discriminatedUnion("ruleType", [
  z.object({ ruleType: z.literal("FLAT"), ruleConfig: FlatRuleSchema }),
  z.object({ ruleType: z.literal("PERCENTAGE"), ruleConfig: PercentageRuleSchema }),
  z.object({ ruleType: z.literal("BRACKET"), ruleConfig: BracketRuleSchema }),
]);
export type Rule = z.infer<typeof RuleSchema>;

export const CreateComponentRequestSchema = z.intersection(
  RuleSchema,
  z.object({
    name: z.string().trim().min(1).max(120),
    effectiveFrom: z.string().date(),
    country: z.string().length(2).optional(),
  }),
);
export type CreateComponentRequest = z.infer<typeof CreateComponentRequestSchema>;

// A new version: either a new rule from effectiveFrom, or `active: false` to discontinue.
export const CreateVersionRequestSchema = z.union([
  z.intersection(RuleSchema, z.object({ effectiveFrom: z.string().date(), name: z.string().trim().min(1).max(120).optional() })),
  z.object({ effectiveFrom: z.string().date(), active: z.literal(false) }),
]);
export type CreateVersionRequest = z.infer<typeof CreateVersionRequestSchema>;

export const ComponentVersionSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  name: z.string(),
  ruleType: z.enum(["FLAT", "PERCENTAGE", "BRACKET"]),
  ruleConfig: z.record(z.string(), z.unknown()),
  effectiveFrom: z.string(),
  active: z.boolean(),
  country: z.string().nullable(),
});

export const CreateExemptionRequestSchema = z.object({
  employeeId: z.string(),
  groupId: z.string(),
  reason: z.string().max(500).optional(),
});

export const GenerateReportRequestSchema = z.object({
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2000).max(2100),
});

export const ComplianceReportSchema = z.object({
  id: z.string(),
  periodMonth: z.number().int(),
  periodYear: z.number().int(),
  generatedAt: z.string().datetime(),
  totals: z.object({
    components: z.array(z.object({ groupId: z.string(), name: z.string(), totalWithheld: z.number(), employeeCount: z.number().int() })),
    grandTotal: z.number(),
    payslipCount: z.number().int(),
  }),
});
