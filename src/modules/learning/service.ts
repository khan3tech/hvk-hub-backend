// Learning & development (specs/023-learning-development): courses, assignments,
// completion with optional proof, and the compliance dashboard.
import { DomainError } from "../../middleware/errorHandler.js";
import { uploadEmployeeDocument, type UploadedFile } from "../documents/service.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";

type Assignment = NonNullable<Awaited<ReturnType<typeof repo.findAssignment>>>;
export type AssignmentState = "INCOMPLETE" | "COMPLETE" | "OVERDUE";
export interface AssignInput {
  audience: "COMPANY" | "DEPARTMENT" | "EMPLOYEES";
  departmentId?: string;
  employeeIds?: string[];
  dueDate?: string;
}

// New hires enrolled after a compliance due date has passed get this long instead (R4).
export const NEW_HIRE_GRACE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
const isHr = (actor: AccessTokenPayload) => actor.role === "HR" || actor.role === "ADMIN";
const startOfToday = () => new Date(new Date().toISOString().slice(0, 10));

async function audit(orgId: string, actor: AccessTokenPayload | null, action: string, entity: string, entityId: string, after?: unknown) {
  if (actor?.employeeId) await repo.writeActivityLog({ orgId, actorId: actor.employeeId, action, entity, entityId, after });
}

// FR-005: overdue is derived — incomplete and the due date has passed.
export function stateOf(a: { status: string; dueDate: Date | null }, today = startOfToday()): AssignmentState {
  if (a.status === "COMPLETE") return "COMPLETE";
  return a.dueDate && a.dueDate < today ? "OVERDUE" : "INCOMPLETE";
}

function present(a: Assignment) {
  return {
    id: a.id,
    course: a.course,
    employee: { id: a.employee.id, name: a.employee.name, active: a.employee.status === "ACTIVE" },
    dueDate: a.dueDate,
    status: stateOf(a),
    completedAt: a.completedAt,
    proofDocumentId: a.proofDocumentId,
    assignedAt: a.assignedAt,
    viaGroupAssignment: a.ruleId !== null,
  };
}

// --- Courses (FR-001, FR-004, FR-006) ---

export async function createCourse(orgId: string, input: repo.CourseFields & { title: string }, actor: AccessTokenPayload) {
  const course = await repo.createCourse(orgId, input, actor.employeeId);
  await audit(orgId, actor, "course.created", "Course", course.id, input);
  return course;
}

export async function getCourse(orgId: string, id: string) {
  const course = await repo.findCourse(orgId, id);
  if (!course) throw new DomainError("NOT_FOUND", "Course not found.", 404);
  return course;
}

export function listCourses(orgId: string, archived?: boolean) {
  return repo.listCourses(orgId, archived);
}

export async function updateCourse(orgId: string, id: string, input: repo.CourseFields, actor: AccessTokenPayload) {
  await getCourse(orgId, id);
  const course = await repo.updateCourse(id, input);
  await audit(orgId, actor, "course.updated", "Course", id, input);
  return course;
}

// Edge case: archiving stops new assignments; existing assignments and completions are kept (FR-009).
export async function archiveCourse(orgId: string, id: string, actor: AccessTokenPayload) {
  await getCourse(orgId, id);
  const course = await repo.updateCourse(id, { archived: true });
  await audit(orgId, actor, "course.archived", "Course", id);
  return course;
}

// --- Assignment (FR-002, FR-007, FR-010) ---

async function audienceIds(orgId: string, input: AssignInput): Promise<string[]> {
  if (input.audience === "COMPANY") return (await repo.listEmployees(orgId, {})).map((e) => e.id);
  if (input.audience === "DEPARTMENT") {
    if (!input.departmentId || !(await repo.departmentInOrg(orgId, input.departmentId))) {
      throw new DomainError("VALIDATION_ERROR", "Choose a department in this organization.", 400);
    }
    return (await repo.listEmployees(orgId, { departmentId: input.departmentId })).map((e) => e.id);
  }
  const ids = [...new Set(input.employeeIds ?? [])];
  if (ids.length === 0) throw new DomainError("VALIDATION_ERROR", "Choose at least one employee.", 400);
  const found = await repo.listEmployees(orgId, { id: { in: ids } });
  if (found.length !== ids.length) throw new DomainError("VALIDATION_ERROR", "Every employee must be an active employee in this organization.", 400);
  return ids;
}

export async function assign(orgId: string, courseId: string, input: AssignInput, actor: AccessTokenPayload) {
  const course = await getCourse(orgId, courseId);
  if (course.archived) throw new DomainError("COURSE_ARCHIVED", "Archived courses can't be assigned.", 409);
  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  const targets = await audienceIds(orgId, input);
  // Group assignments are remembered so compliance courses can enroll later hires (FR-007).
  const rule = input.audience === "EMPLOYEES" ? null : await repo.createRule({
    orgId, courseId, audience: input.audience, departmentId: input.departmentId ?? null, dueDate, createdById: actor.employeeId,
  });
  const open = await repo.employeesWithOpenAssignment(courseId, targets);
  const fresh = targets.filter((id) => !open.has(id));
  await repo.createAssignments(fresh.map((employeeId) => ({
    orgId, courseId, employeeId, dueDate, ruleId: rule?.id ?? null, assignedById: actor.employeeId,
  })));
  await audit(orgId, actor, "course.assigned", "Course", courseId, { audience: input.audience, departmentId: input.departmentId, assigned: fresh.length, dueDate: input.dueDate });
  return { courseId, assigned: fresh.length, alreadyAssigned: open.size };
}

// Registered with employee/service.onEmployeeCreated() in app.ts. FR-007: compliance courses
// assigned company-wide or to the hire's department enroll them; ordinary ones don't (US1.3).
export async function onEmployeeCreated(orgId: string, employeeId: string, actor: AccessTokenPayload) {
  const employee = await repo.findEmployee(orgId, employeeId);
  if (!employee || employee.status !== "ACTIVE") return;
  const rules = (await repo.listComplianceRules(orgId))
    .filter((r) => r.audience === "COMPANY" || r.departmentId === employee.departmentId);
  const today = startOfToday();
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.courseId)) continue;
    seen.add(rule.courseId);
    if ((await repo.employeesWithOpenAssignment(rule.courseId, [employeeId])).size > 0) continue;
    const dueDate = rule.dueDate && rule.dueDate >= today ? rule.dueDate : new Date(today.getTime() + NEW_HIRE_GRACE_DAYS * DAY);
    await repo.createAssignments([{ orgId, courseId: rule.courseId, employeeId, dueDate, ruleId: rule.id, assignedById: null }]);
    await audit(orgId, actor, "course.auto_assigned", "Course", rule.courseId, { employeeId, ruleId: rule.id });
  }
}

// --- Tracking (FR-003, FR-005) ---

export async function myAssignments(orgId: string, actor: AccessTokenPayload) {
  if (!actor.employeeId) return [];
  return (await repo.listAssignments(orgId, { employeeId: actor.employeeId })).map(present);
}

export async function listAssignments(orgId: string, filters: { courseId?: string; employeeId?: string; status?: AssignmentState }) {
  const today = startOfToday();
  const where = {
    ...(filters.courseId ? { courseId: filters.courseId } : {}),
    ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
    ...(filters.status === "COMPLETE" ? { status: "COMPLETE" as const } : {}),
    ...(filters.status === "OVERDUE" ? { status: { not: "COMPLETE" as const }, dueDate: { lt: today } } : {}),
    ...(filters.status === "INCOMPLETE" ? { status: { not: "COMPLETE" as const }, OR: [{ dueDate: null }, { dueDate: { gte: today } }] } : {}),
  };
  return (await repo.listAssignments(orgId, where)).map(present);
}

export async function getAssignment(orgId: string, id: string, actor: AccessTokenPayload) {
  const a = await repo.findAssignment(orgId, id);
  if (!a || (!isHr(actor) && a.employeeId !== actor.employeeId)) throw new DomainError("NOT_FOUND", "Assignment not found.", 404);
  return present(a);
}

// FR-003/FR-004, SC-005: only the assignee completes; proof-required courses need a file first.
export async function complete(orgId: string, id: string, file: UploadedFile | undefined, actor: AccessTokenPayload) {
  const a = await repo.findAssignment(orgId, id);
  if (!a || a.employeeId !== actor.employeeId) throw new DomainError("NOT_FOUND", "Assignment not found.", 404);
  if (a.status === "COMPLETE") throw new DomainError("ALREADY_COMPLETE", "This course is already complete.", 409);
  if (a.course.requiresProof && !file) {
    throw new DomainError("PROOF_REQUIRED", "This course needs a certificate or attestation attached in the 'file' field.", 400);
  }
  const proof = file
    ? await uploadEmployeeDocument(orgId, a.employeeId, { label: `Course completion: ${a.course.title}`.slice(0, 120), managerVisible: false }, file, actor)
    : null;
  const { count } = await repo.completeAssignment(id, proof?.id ?? null);
  if (count === 0) throw new DomainError("ALREADY_COMPLETE", "This course is already complete.", 409);
  await audit(orgId, actor, "course.completed", "CourseAssignment", id, { courseId: a.courseId, proofDocumentId: proof?.id ?? null });
  return getAssignment(orgId, id, actor);
}

// --- Compliance dashboard (FR-008, SC-003) ---

// Active workforce only: offboarded employees' assignments stay on record but don't count.
export async function complianceDashboard(orgId: string) {
  const today = startOfToday();
  const courses = (await repo.listCourses(orgId, false)).filter((c) => c.isComplianceRequired);
  const assignments = await repo.listAssignments(orgId, { courseId: { in: courses.map((c) => c.id) }, employee: { status: "ACTIVE" } });
  return {
    courses: courses.map((course) => {
      // The latest cycle per employee decides whether they're compliant now (FR-010).
      const latest = new Map<string, Assignment>();
      for (const a of assignments.filter((x) => x.courseId === course.id)) {
        const prev = latest.get(a.employeeId);
        if (!prev || a.assignedAt > prev.assignedAt) latest.set(a.employeeId, a);
      }
      const rows = [...latest.values()];
      const outstanding = rows.filter((a) => stateOf(a, today) !== "COMPLETE");
      return {
        courseId: course.id,
        title: course.title,
        assigned: rows.length,
        completed: rows.length - outstanding.length,
        outstanding: outstanding.length,
        outstandingEmployees: outstanding.map((a) => ({
          assignmentId: a.id, employeeId: a.employeeId, name: a.employee.name, dueDate: a.dueDate, overdue: stateOf(a, today) === "OVERDUE",
        })),
      };
    }),
  };
}

