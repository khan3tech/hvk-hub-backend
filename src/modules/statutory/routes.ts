import { Router } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./controller.js";
import {
  ComplianceReportSchema,
  ComponentVersionSchema,
  CreateComponentRequestSchema,
  CreateExemptionRequestSchema,
  CreateVersionRequestSchema,
  GenerateReportRequestSchema,
} from "./schema.js";

// FR-009: every statutory route is Admin/HR only. Contract:
// specs/010-statutory-payroll-tax/contracts/statutory-api.md.
export const statutoryRouter = Router();
statutoryRouter.use(authenticate, authorize("ADMIN", "HR"));
const TAG = "Statutory Payroll Tax";

statutoryRouter.get("/components", handle(c.listComponents));
statutoryRouter.post("/components", validate(CreateComponentRequestSchema), handle(c.createComponent));
statutoryRouter.post("/components/:groupId/versions", validate(CreateVersionRequestSchema), handle(c.createVersion));
statutoryRouter.get("/exemptions", handle(c.listExemptions));
statutoryRouter.post("/exemptions", validate(CreateExemptionRequestSchema), handle(c.createExemption));
statutoryRouter.delete("/exemptions/:id", handle(c.removeExemption));
statutoryRouter.post("/reports", validate(GenerateReportRequestSchema), handle(c.generateReport));
statutoryRouter.get("/reports", handle(c.listReports));
statutoryRouter.get("/reports/:id", handle(c.getReport));
statutoryRouter.get("/reports/:id/export", handle(c.exportReport));

const group = z.object({ groupId: z.string() });
const id = z.object({ id: z.string() });
documentRoute({ method: "get", path: "/statutory/components", tag: TAG, description: "Every statutory component: the version in effect today plus its full version history. Admin/HR." });
documentRoute({ method: "post", path: "/statutory/components", tag: TAG, description: "Define a component: FLAT {amount}, PERCENTAGE {percent, base, cap?} or BRACKET {base, period, brackets[]}, effective from a date. Admin/HR.", body: CreateComponentRequestSchema, response: ComponentVersionSchema });
documentRoute({ method: "post", path: "/statutory/components/{groupId}/versions", tag: TAG, description: "Add a new effective-dated rule version (or {active:false} to discontinue); past periods keep the rule they ran with. Admin/HR.", params: group, body: CreateVersionRequestSchema, response: ComponentVersionSchema });
documentRoute({ method: "get", path: "/statutory/exemptions", tag: TAG, description: "Exemptions, filterable by employee or component. Admin/HR.", query: z.object({ employeeId: z.string().optional(), groupId: z.string().optional() }) });
documentRoute({ method: "post", path: "/statutory/exemptions", tag: TAG, description: "Exempt one employee from one component (all its versions). Admin/HR.", body: CreateExemptionRequestSchema });
documentRoute({ method: "delete", path: "/statutory/exemptions/{id}", tag: TAG, status: 204, description: "Remove an exemption. Admin/HR.", params: id });
documentRoute({ method: "post", path: "/statutory/reports", tag: TAG, description: "Generate the compliance report for a period from its current payslips. Admin/HR.", body: GenerateReportRequestSchema, response: ComplianceReportSchema });
documentRoute({ method: "get", path: "/statutory/reports", tag: TAG, description: "Generated reports, newest first. Admin/HR.", query: z.object({ periodMonth: z.string().optional(), periodYear: z.string().optional() }), response: z.array(ComplianceReportSchema) });
documentRoute({ method: "get", path: "/statutory/reports/{id}", tag: TAG, description: "One compliance report. Admin/HR.", params: id, response: ComplianceReportSchema });
documentRoute({ method: "get", path: "/statutory/reports/{id}/export", tag: TAG, description: "Download the report as CSV (component totals, then per-employee lines). Admin/HR.", params: id });
