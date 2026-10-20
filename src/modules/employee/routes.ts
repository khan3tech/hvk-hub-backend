import { Router } from "express";
import { z } from "zod";
import { registry, bearerAuth } from "../../lib/openapi.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./controller.js";
import {
  CreateEmployeeRequestSchema,
  CreateEmployeeResponseSchema,
  UpdateEmployeeRequestSchema,
  EmployeeSchema,
  EmployeeListResponseSchema,
  DirectoryResponseSchema,
  TeamViewResponseSchema,
  DepartmentSchema,
  DesignationSchema,
  CreateDepartmentRequestSchema,
  CreateDesignationRequestSchema,
} from "./schema.js";

// Declares this module's endpoints, attaches auth + RBAC middleware, and
// delegates to controller.ts. See specs/002-employee-management/spec.md and
// contracts/employee-api.md for requirements.
export const employeeRouter = Router();

employeeRouter.post(
  "/",
  authenticate,
  authorize("ADMIN", "HR"),
  validate(CreateEmployeeRequestSchema),
  (req, res, next) => {
    controller.createEmployee(req, res).catch(next);
  },
);

employeeRouter.get("/", authenticate, (req, res, next) => {
  controller.listEmployees(req, res).catch(next);
});

employeeRouter.get("/directory", authenticate, (req, res, next) => {
  controller.searchDirectory(req, res).catch(next);
});

employeeRouter.get("/me/team", authenticate, authorize("MANAGER"), (req, res, next) => {
  controller.getTeamView(req, res).catch(next);
});

employeeRouter.get("/:id", authenticate, (req, res, next) => {
  controller.getEmployee(req, res).catch(next);
});

employeeRouter.patch(
  "/:id",
  authenticate,
  authorize("ADMIN", "HR"),
  validate(UpdateEmployeeRequestSchema),
  (req, res, next) => {
    controller.updateEmployee(req, res).catch(next);
  },
);

employeeRouter.post(
  "/:id/offboard",
  authenticate,
  authorize("ADMIN", "HR"),
  (req, res, next) => {
    controller.offboardEmployee(req, res).catch(next);
  },
);

export const departmentRouter = Router();

departmentRouter.get("/", authenticate, (req, res, next) => {
  controller.listDepartments(req, res).catch(next);
});

departmentRouter.post(
  "/",
  authenticate,
  authorize("ADMIN", "HR"),
  validate(CreateDepartmentRequestSchema),
  (req, res, next) => {
    controller.createDepartment(req, res).catch(next);
  },
);

export const designationRouter = Router();

designationRouter.get("/", authenticate, (req, res, next) => {
  controller.listDesignations(req, res).catch(next);
});

designationRouter.post(
  "/",
  authenticate,
  authorize("ADMIN", "HR"),
  validate(CreateDesignationRequestSchema),
  (req, res, next) => {
    controller.createDesignation(req, res).catch(next);
  },
);

registry.registerPath({
  method: "post",
  path: "/employees",
  tags: ["Employees"],
  description: "Create a new employee record and provision its linked login account. Admin/HR only.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: CreateEmployeeRequestSchema } } } },
  responses: {
    201: { description: "Created.", content: { "application/json": { schema: CreateEmployeeResponseSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/employees",
  tags: ["Employees"],
  description: "List employees, scoped to the caller's role.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    query: z.object({
      department: z.string().optional(),
      designation: z.string().optional(),
      status: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "Employees.", content: { "application/json": { schema: EmployeeListResponseSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/employees/directory",
  tags: ["Employees"],
  description: "Search basic directory info (name, department, title) for all active employees.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    query: z.object({
      q: z.string().optional(),
      department: z.string().optional(),
      designation: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "Directory entries.", content: { "application/json": { schema: DirectoryResponseSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/employees/me/team",
  tags: ["Employees"],
  description: "The calling Manager's own manager and direct reports. Manager only.",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: { description: "Team view.", content: { "application/json": { schema: TeamViewResponseSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/employees/{id}",
  tags: ["Employees"],
  description: "Get one employee record, scoped to the caller's role.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Employee.", content: { "application/json": { schema: EmployeeSchema } } },
  },
});

registry.registerPath({
  method: "patch",
  path: "/employees/{id}",
  tags: ["Employees"],
  description: "Update an employee's department, designation, or manager. Admin/HR only.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: UpdateEmployeeRequestSchema } } },
  },
  responses: {
    200: { description: "Updated.", content: { "application/json": { schema: EmployeeSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/employees/{id}/offboard",
  tags: ["Employees"],
  description: "Offboard (deactivate) an employee. Admin/HR only. Never a hard delete.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Offboarded." },
  },
});

registry.registerPath({
  method: "get",
  path: "/departments",
  tags: ["Employees"],
  description: "List departments.",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: { description: "Departments.", content: { "application/json": { schema: z.array(DepartmentSchema) } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/departments",
  tags: ["Employees"],
  description: "Create a department. Admin/HR only.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: CreateDepartmentRequestSchema } } } },
  responses: {
    201: { description: "Created.", content: { "application/json": { schema: DepartmentSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/designations",
  tags: ["Employees"],
  description: "List designations.",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: { description: "Designations.", content: { "application/json": { schema: z.array(DesignationSchema) } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/designations",
  tags: ["Employees"],
  description: "Create a designation. Admin/HR only.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: CreateDesignationRequestSchema } } } },
  responses: {
    201: { description: "Created.", content: { "application/json": { schema: DesignationSchema } } },
  },
});
