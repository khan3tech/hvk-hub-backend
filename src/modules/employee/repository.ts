// Prisma queries only — this is the one place in the employee module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
// See specs/002-employee-management/spec.md → Key Entities for the data this module owns.
import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "@prisma/client";

export function createEmployee(data: Prisma.EmployeeUncheckedCreateInput) {
  return prisma.employee.create({ data });
}

export function findEmployeeById(orgId: string, id: string) {
  return prisma.employee.findFirst({
    where: { id, orgId },
    include: { user: { select: { id: true } } },
  });
}

export function findEmployeeByEmail(orgId: string, email: string) {
  return prisma.employee.findUnique({
    where: { orgId_email: { orgId, email: email.toLowerCase() } },
  });
}

export function updateEmployee(id: string, data: Prisma.EmployeeUncheckedUpdateInput) {
  return prisma.employee.update({ where: { id }, data });
}

export function countEmployees(orgId: string) {
  return prisma.employee.count({ where: { orgId } });
}

export function listEmployees(orgId: string, where: Prisma.EmployeeWhereInput = {}) {
  return prisma.employee.findMany({ where: { orgId, ...where } });
}

export function findDepartments(orgId: string) {
  return prisma.department.findMany({ where: { orgId } });
}

export function createDepartment(orgId: string, name: string) {
  return prisma.department.create({ data: { orgId, name } });
}

export function findDesignations(orgId: string) {
  return prisma.designation.findMany({ where: { orgId } });
}

export function createDesignation(orgId: string, title: string, level?: number) {
  return prisma.designation.create({ data: { orgId, title, level } });
}

export function writeActivityLog(params: {
  orgId: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}) {
  return prisma.activityLog.create({
    data: {
      orgId: params.orgId,
      actorId: params.actorId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      before: params.before as never,
      after: params.after as never,
    },
  });
}

// 004-payroll research.md R4: the offboarding cutoff for proration is read from this module's
// own audit trail rather than a new Employee field — see service.ts's getOffboardedDate.
export function findOffboardActivityLog(orgId: string, employeeId: string) {
  return prisma.activityLog.findFirst({
    where: { orgId, entity: "Employee", entityId: employeeId, action: "employee.offboarded" },
    orderBy: { createdAt: "desc" },
  });
}

export function listAllEmployees(orgId: string) {
  return prisma.employee.findMany({
    where: { orgId },
    select: { id: true, name: true, departmentId: true, designationId: true, dateOfJoining: true, status: true },
  });
}

export function findOffboardDates(orgId: string) {
  return prisma.activityLog.findMany({
    where: { orgId, entity: "Employee", action: "employee.offboarded" },
    select: { entityId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

// 015 FR-003: lookups referenced by id must belong to the caller's organization.
export function departmentInOrg(orgId: string, id: string) {
  return prisma.department.count({ where: { id, orgId } }).then((n) => n > 0);
}

export function designationInOrg(orgId: string, id: string) {
  return prisma.designation.count({ where: { id, orgId } }).then((n) => n > 0);
}

export function updateDepartment(id: string, data: Prisma.DepartmentUncheckedUpdateInput) {
  return prisma.department.update({ where: { id }, data });
}
