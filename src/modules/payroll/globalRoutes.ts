import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { orgOf } from "../../lib/tenant.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as global from "./global.js";

// 026-global-multi-currency-payroll. Contract: specs/026-global-multi-currency-payroll/contracts/.
// Mounted under /api/payroll beside the 004 routes. Admin/HR only.
export const payrollGlobalRouter = Router();
const HR = [authenticate, authorize("ADMIN", "HR")];
const TAG = "Payroll — Global";

const Code = (n: number) => z.string().trim().length(n);
const SettingsSchema = z.object({
  defaultCountry: Code(2).nullable().optional(),
  defaultCurrency: Code(3).nullable().optional(),
  reportingCurrency: Code(3).nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, "Nothing to update.");
const AssignmentSchema = z.object({ country: Code(2), currency: Code(3), effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const Period = { periodMonth: z.number().int().min(1).max(12), periodYear: z.number().int().min(2000) };
const RateSchema = z.object({ fromCurrency: Code(3), rate: z.number().positive().max(1e9), ...Period });
const PeriodQuery = z.object({ periodMonth: z.coerce.number().int().min(1).max(12), periodYear: z.coerce.number().int().min(2000) });
const actorOf = (req: Request) => req.user as AccessTokenPayload;
const num = (v: unknown) => (typeof v === "string" && v !== "" ? Number(v) : undefined);

payrollGlobalRouter.get("/currency-settings", ...HR, handle(async (req: Request, res: Response) => {
  res.json(await global.getSettings(orgOf(req)));
}));
payrollGlobalRouter.put("/currency-settings", ...HR, validate(SettingsSchema), handle(async (req: Request, res: Response) => {
  res.json(await global.updateSettings(orgOf(req), req.body, actorOf(req)));
}));
payrollGlobalRouter.get("/assignments/:employeeId", ...HR, handle(async (req: Request, res: Response) => {
  res.json(await global.listAssignments(orgOf(req), req.params.employeeId ?? ""));
}));
payrollGlobalRouter.post("/assignments/:employeeId", ...HR, validate(AssignmentSchema), handle(async (req: Request, res: Response) => {
  res.status(201).json(await global.assign(orgOf(req), req.params.employeeId ?? "", req.body, actorOf(req)));
}));
payrollGlobalRouter.get("/exchange-rates", ...HR, handle(async (req: Request, res: Response) => {
  res.json(await global.listExchangeRates(orgOf(req), { periodMonth: num(req.query.periodMonth), periodYear: num(req.query.periodYear) }));
}));
payrollGlobalRouter.put("/exchange-rates", ...HR, validate(RateSchema), handle(async (req: Request, res: Response) => {
  res.json(await global.recordExchangeRate(orgOf(req), req.body, actorOf(req)));
}));
payrollGlobalRouter.get("/reporting-total", ...HR, handle(async (req: Request, res: Response) => {
  const q = PeriodQuery.parse(req.query);
  res.json(await global.reportingTotal(orgOf(req), q.periodMonth, q.periodYear));
}));

const emp = z.object({ employeeId: z.string() });
documentRoute({ method: "get", path: "/payroll/currency-settings", tag: TAG, description: "Home country/currency and reporting currency (all optional), and whether multi-country mode is on. Admin/HR." });
documentRoute({ method: "put", path: "/payroll/currency-settings", tag: TAG, description: "Set the home country, home currency or reporting currency (ISO codes; null clears). Admin/HR.", body: SettingsSchema });
documentRoute({ method: "get", path: "/payroll/assignments/{employeeId}", tag: TAG, description: "An employee's current payroll country/currency and assignment history. Admin/HR.", params: emp });
documentRoute({ method: "post", path: "/payroll/assignments/{employeeId}", tag: TAG, description: "Assign a payroll country and currency from a date (past payslips keep theirs). Admin/HR.", params: emp, body: AssignmentSchema });
documentRoute({ method: "get", path: "/payroll/exchange-rates", tag: TAG, description: "Recorded rates into the reporting currency, by period. Admin/HR.", query: z.object({ periodMonth: z.string().optional(), periodYear: z.string().optional() }) });
documentRoute({ method: "put", path: "/payroll/exchange-rates", tag: TAG, description: "Record (or correct) 1 fromCurrency = rate reporting-currency for a period. Admin/HR.", body: RateSchema });
documentRoute({ method: "get", path: "/payroll/reporting-total", tag: TAG, description: "A period's payroll cost per currency and converted to the reporting currency; the total is null and missingRates lists currencies without a rate. Admin/HR.", query: PeriodQuery });
