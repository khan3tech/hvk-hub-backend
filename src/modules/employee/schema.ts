import { z } from "zod";
import { RoleSchema } from "../auth/schema.js";

// Request/response validation for the employee module.
// See specs/002-employee-management/spec.md for the functional requirements.
export const EmployeeStatusSchema = z.enum(["ACTIVE", "OFFBOARDED"]);
export type EmployeeStatus = z.infer<typeof EmployeeStatusSchema>;

export const CreateEmployeeRequestSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  departmentId: z.string(),
  designationId: z.string(),
  managerId: z.string().nullable().optional(),
  dateOfJoining: z.string().date(),
  role: RoleSchema.optional(),
});
export type CreateEmployeeRequest = z.infer<typeof CreateEmployeeRequestSchema>;

// Deliberately excludes `status` — offboarding is a dedicated, audited, session-revoking
// action (POST /employees/:id/offboard), never a silent field update (data-model.md).
export const UpdateEmployeeRequestSchema = z.object({
  departmentId: z.string().optional(),
  designationId: z.string().optional(),
  managerId: z.string().nullable().optional(),
});
export type UpdateEmployeeRequest = z.infer<typeof UpdateEmployeeRequestSchema>;

export const EmployeeSchema = z.object({
  id: z.string(),
  employeeCode: z.string(),
  name: z.string(),
  email: z.string().email(),
  departmentId: z.string(),
  designationId: z.string(),
  managerId: z.string().nullable(),
  dateOfJoining: z.string().date(),
  status: EmployeeStatusSchema,
});
export type Employee = z.infer<typeof EmployeeSchema>;

export const DepartmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  headEmployeeId: z.string().nullable().optional(),
});
export type Department = z.infer<typeof DepartmentSchema>;

export const DesignationSchema = z.object({
  id: z.string(),
  title: z.string(),
  level: z.number().int().optional(),
});
export type Designation = z.infer<typeof DesignationSchema>;

export const CreateEmployeeResponseSchema = EmployeeSchema.extend({
  temporaryPassword: z.string(),
});
export type CreateEmployeeResponse = z.infer<typeof CreateEmployeeResponseSchema>;

export const EmployeeListResponseSchema = z.array(EmployeeSchema);

export const DirectoryEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  departmentId: z.string().nullable(),
  designationId: z.string().nullable(),
});
export type DirectoryEntry = z.infer<typeof DirectoryEntrySchema>;

export const DirectoryResponseSchema = z.array(DirectoryEntrySchema);

export const TeamViewResponseSchema = z.object({
  manager: DirectoryEntrySchema.nullable(),
  directReports: z.array(DirectoryEntrySchema),
});
export type TeamViewResponse = z.infer<typeof TeamViewResponseSchema>;

export const CreateDepartmentRequestSchema = z.object({ name: z.string().min(1) });
export const CreateDesignationRequestSchema = z.object({
  title: z.string().min(1),
  level: z.number().int().optional(),
});
