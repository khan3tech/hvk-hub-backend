// Prisma queries only — this is the one place in the learning module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";
import type { CourseAudience, Prisma } from "@prisma/client";

const assignmentInclude = {
  course: { select: { id: true, title: true, contentUrl: true, requiresProof: true, isComplianceRequired: true, archived: true } },
  employee: { select: { id: true, name: true, status: true, departmentId: true } },
} as const;

export type CourseFields = {
  title?: string;
  description?: string | null;
  contentUrl?: string | null;
  requiresProof?: boolean;
  isComplianceRequired?: boolean;
};

export function createCourse(orgId: string, data: CourseFields & { title: string }, createdById: string | null) {
  return prisma.course.create({ data: { orgId, ...data, createdById } });
}

export function findCourse(orgId: string, id: string) {
  return prisma.course.findFirst({ where: { id, orgId } });
}

export function listCourses(orgId: string, archived?: boolean) {
  return prisma.course.findMany({ where: { orgId, ...(archived === undefined ? {} : { archived }) }, orderBy: { title: "asc" } });
}

export function updateCourse(id: string, data: CourseFields & { archived?: boolean }) {
  return prisma.course.update({ where: { id }, data });
}

export function createRule(data: { orgId: string; courseId: string; audience: CourseAudience; departmentId: string | null; dueDate: Date | null; createdById: string | null }) {
  return prisma.courseAssignmentRule.create({ data });
}

// FR-007: rules that keep enrolling new hires — compliance courses still in use.
export function listComplianceRules(orgId: string) {
  return prisma.courseAssignmentRule.findMany({
    where: { orgId, audience: { in: ["COMPANY", "DEPARTMENT"] }, course: { isComplianceRequired: true, archived: false } },
    include: { course: { select: { id: true, title: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export function listEmployees(orgId: string, where: Prisma.EmployeeWhereInput) {
  return prisma.employee.findMany({ where: { orgId, status: "ACTIVE", ...where }, select: { id: true } });
}

export function findEmployee(orgId: string, id: string) {
  return prisma.employee.findFirst({ where: { orgId, id }, select: { id: true, status: true, departmentId: true } });
}

export function departmentInOrg(orgId: string, id: string) {
  return prisma.department.count({ where: { orgId, id } }).then((n) => n > 0);
}

// FR-010: only an open (incomplete) assignment blocks a new one; past completions don't.
export async function employeesWithOpenAssignment(courseId: string, employeeIds: string[]) {
  const rows = await prisma.courseAssignment.findMany({
    where: { courseId, employeeId: { in: employeeIds }, status: { not: "COMPLETE" } },
    select: { employeeId: true },
  });
  return new Set(rows.map((r) => r.employeeId));
}

export function createAssignments(rows: Prisma.CourseAssignmentCreateManyInput[]) {
  return prisma.courseAssignment.createMany({ data: rows });
}

export function findAssignment(orgId: string, id: string) {
  return prisma.courseAssignment.findFirst({ where: { id, orgId }, include: assignmentInclude });
}

export function listAssignments(orgId: string, where: Prisma.CourseAssignmentWhereInput) {
  return prisma.courseAssignment.findMany({ where: { orgId, ...where }, include: assignmentInclude, orderBy: [{ dueDate: "asc" }, { assignedAt: "desc" }] });
}

// FR-003: incomplete -> complete exactly once (conditional update).
export function completeAssignment(id: string, proofDocumentId: string | null) {
  return prisma.courseAssignment.updateMany({
    where: { id, status: { not: "COMPLETE" } },
    data: { status: "COMPLETE", completedAt: new Date(), proofDocumentId },
  });
}

export function writeActivityLog(params: { orgId: string; actorId: string; action: string; entity: string; entityId: string; after?: unknown }) {
  return prisma.activityLog.create({ data: { ...params, after: params.after as Prisma.InputJsonValue | undefined } });
}
