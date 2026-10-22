import { Router } from "express";
import { z } from "zod";
import { registry, bearerAuth } from "../../lib/openapi.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./controller.js";
import {
  SetSalaryStructureRequestSchema,
  SalaryStructureSchema,
  RunPayrollRequestSchema,
  RunPayrollResponseSchema,
  PayslipSchema,
  PayslipListResponseSchema,
} from "./schema.js";

// Declares this module's endpoints, attaches auth + RBAC middleware, and
// delegates to controller.ts. See specs/004-payroll/spec.md and
// contracts/payroll-api.md for requirements.
export const payrollRouter = Router();

payrollRouter.post(
  "/salary-structures/:employeeId",
  authenticate,
  authorize("ADMIN", "HR"),
  validate(SetSalaryStructureRequestSchema),
  (req, res, next) => {
    controller.setSalaryStructure(req, res).catch(next);
  },
);

payrollRouter.get("/salary-structures/:employeeId", authenticate, (req, res, next) => {
  controller.getSalaryStructure(req, res).catch(next);
});

payrollRouter.post(
  "/runs",
  authenticate,
  authorize("ADMIN", "HR"),
  validate(RunPayrollRequestSchema),
  (req, res, next) => {
    controller.runPayroll(req, res).catch(next);
  },
);

payrollRouter.get("/payslips/me", authenticate, (req, res, next) => {
  controller.getMyPayslips(req, res).catch(next);
});

payrollRouter.get("/payslips/me/:id", authenticate, (req, res, next) => {
  controller.getMyPayslipById(req, res).catch(next);
});

payrollRouter.get("/payslips/me/:id/pdf", authenticate, (req, res, next) => {
  controller.getMyPayslipPdf(req, res).catch(next);
});

payrollRouter.get("/payslips/:id/pdf", authenticate, authorize("ADMIN", "HR"), (req, res, next) => {
  controller.getPayslipPdf(req, res).catch(next);
});

payrollRouter.get("/payslips/team", authenticate, authorize("MANAGER"), (req, res, next) => {
  controller.getTeamPayslips(req, res).catch(next);
});

payrollRouter.get("/payslips", authenticate, authorize("ADMIN", "HR"), (req, res, next) => {
  controller.listPayslipsOrgWide(req, res).catch(next);
});

registry.registerPath({
  method: "post",
  path: "/payroll/salary-structures/{employeeId}",
  tags: ["Payroll"],
  description: "Create a new salary structure version for an employee. Admin/HR only.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ employeeId: z.string() }),
    body: { content: { "application/json": { schema: SetSalaryStructureRequestSchema } } },
  },
  responses: {
    201: { description: "Created.", content: { "application/json": { schema: SalaryStructureSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/payroll/salary-structures/{employeeId}",
  tags: ["Payroll"],
  description: "Get the salary structure in effect for an employee as of a given date (defaults to today).",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ employeeId: z.string() }),
    query: z.object({ asOf: z.string().optional() }),
  },
  responses: {
    200: { description: "Structure.", content: { "application/json": { schema: SalaryStructureSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/payroll/runs",
  tags: ["Payroll"],
  description: "Trigger a payroll run for a period across all active employees. Admin/HR only.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: RunPayrollRequestSchema } } } },
  responses: {
    200: { description: "Run complete.", content: { "application/json": { schema: RunPayrollResponseSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/payroll/payslips/me",
  tags: ["Payroll"],
  description: "The caller's own payslips, all periods.",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: { description: "Payslips.", content: { "application/json": { schema: PayslipListResponseSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/payroll/payslips/me/{id}",
  tags: ["Payroll"],
  description: "One of the caller's own payslips, with full breakdown.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Payslip.", content: { "application/json": { schema: PayslipSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/payroll/payslips/team",
  tags: ["Payroll"],
  description: "Payslips for the caller's current direct reports, view-only. Manager only.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    query: z.object({ periodMonth: z.string().optional(), periodYear: z.string().optional() }),
  },
  responses: {
    200: { description: "Payslips.", content: { "application/json": { schema: PayslipListResponseSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/payroll/payslips",
  tags: ["Payroll"],
  description: "All payslips org-wide, optionally filtered. Admin/HR only.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    query: z.object({
      employeeId: z.string().optional(),
      periodMonth: z.string().optional(),
      periodYear: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "Payslips.", content: { "application/json": { schema: PayslipListResponseSchema } } },
  },
});
