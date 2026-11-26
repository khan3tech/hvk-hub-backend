// Business rules for the employee module. Framework-agnostic — no req/res.
// Calls repository.ts for persistence; never imports Prisma directly.
// Implements the functional requirements (FR-xxx) in specs/002-employee-management/spec.md.
import bcrypt from "bcrypt";
import moment from "moment";
import { randomBytes } from "node:crypto";
import { DomainError } from "../../middleware/errorHandler.js";
import { revokeAllSessionsForUser } from "../auth/service.js";
import { logger } from "../../lib/logger.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import type { CreateEmployeeRequest, UpdateEmployeeRequest } from "./schema.js";

const BCRYPT_COST = 12;

// research.md R1: sequential, human-readable code. The unique constraint on
// [orgId, employeeCode] is the correctness backstop for the rare concurrent-create race;
// this count-based approach avoids a separate counter table (Principle VII).
async function generateEmployeeCode(orgId: string): Promise<string> {
  const count = await repo.countEmployees(orgId);
  return `EMP-${String(count + 1).padStart(5, "0")}`;
}

// research.md R2: rejects direct self-reference, transitive cycles, and offboarded managers.
// Bounded by orgId's total employee count so a corrupted chain can't loop forever.
async function validateManagerAssignment(
  orgId: string,
  employeeId: string | null,
  candidateManagerId: string,
): Promise<void> {
  if (candidateManagerId === employeeId) {
    throw new DomainError("MANAGER_INVALID", "An employee cannot be their own manager.", 409);
  }

  const candidate = await repo.findEmployeeById(orgId, candidateManagerId);
  if (!candidate) {
    throw new DomainError("MANAGER_INVALID", "The selected manager does not exist.", 409);
  }
  if (candidate.status !== "ACTIVE") {
    throw new DomainError("MANAGER_INVALID", "The selected manager is offboarded.", 409);
  }

  if (employeeId) {
    const maxDepth = await repo.countEmployees(orgId);
    let current: { id: string; managerId: string | null } | null = candidate;
    for (let depth = 0; current?.managerId && depth < maxDepth; depth++) {
      if (current.managerId === employeeId) {
        throw new DomainError(
          "MANAGER_INVALID",
          "This assignment would create a reporting-line cycle.",
          409,
        );
      }
      current = await repo.findEmployeeById(orgId, current.managerId);
    }
  }
}

function generateTemporaryPassword(): string {
  return randomBytes(9).toString("base64url");
}

function toDirectoryEntry(employee: { id: string; name: string; departmentId: string | null; designationId: string | null }) {
  return {
    id: employee.id,
    name: employee.name,
    departmentId: employee.departmentId,
    designationId: employee.designationId,
  };
}

// --- Extension points for modules that build on Employee (Principle I: they register here at
// startup in app.ts instead of this module importing them, which would create import cycles) ---

type EmployeeCreatedHook = (orgId: string, employeeId: string, actor: AccessTokenPayload) => Promise<void>;
const employeeCreatedHooks = new Set<EmployeeCreatedHook>();

// e.g. 007-employee-onboarding attaches a checklist to every new employee (FR-001).
export function onEmployeeCreated(hook: EmployeeCreatedHook): void {
  employeeCreatedHooks.add(hook);
}

// e.g. 024-succession-planning invalidates the leaver's successor entries (FR-005).
type EmployeeOffboardedHook = (orgId: string, employeeId: string, actor: AccessTokenPayload) => Promise<void>;
const employeeOffboardedHooks = new Set<EmployeeOffboardedHook>();

export function onEmployeeOffboarded(hook: EmployeeOffboardedHook): void {
  employeeOffboardedHooks.add(hook);
}

// Read-time decorations from other modules (007 onboardingStatus, 009 exitStatus): each returns
// extra fields per employee id, merged into get/list responses. A failing decorator is skipped.
// The requester lets a decorator restrict what it adds (024: HR/Admin-only flags).
type EmployeeDecorator = (orgId: string, employeeIds: string[], requester?: AccessTokenPayload) => Promise<Map<string, Record<string, unknown>>>;
const employeeDecorators = new Map<string, EmployeeDecorator>();

export function registerEmployeeDecorator(name: string, decorator: EmployeeDecorator): void {
  employeeDecorators.set(name, decorator);
}

async function decorate<T extends { id: string }>(orgId: string, employees: T[], requester?: AccessTokenPayload) {
  if (employeeDecorators.size === 0 || employees.length === 0) return employees;
  const ids = employees.map((e) => e.id);
  const extras = new Map<string, Record<string, unknown>>(ids.map((id) => [id, {}]));
  for (const [name, decorator] of employeeDecorators) {
    try {
      for (const [id, fields] of await decorator(orgId, ids, requester)) Object.assign(extras.get(id) ?? {}, fields);
    } catch (err) {
      logger.warn({ err, decorator: name }, "employee decorator failed");
    }
  }
  return employees.map((e) => ({ ...e, ...extras.get(e.id) }));
}

// 015 FR-003/FR-004: never link an employee to another organization's department/designation.
async function assertLookupsInOrg(orgId: string, input: { departmentId?: string | null; designationId?: string | null }) {
  if (input.departmentId && !(await repo.departmentInOrg(orgId, input.departmentId))) {
    throw new DomainError("VALIDATION_ERROR", "Department not found.", 400, { departmentId: ["Unknown department."] });
  }
  if (input.designationId && !(await repo.designationInOrg(orgId, input.designationId))) {
    throw new DomainError("VALIDATION_ERROR", "Designation not found.", 400, { designationId: ["Unknown designation."] });
  }
}

export async function createEmployee(
  orgId: string,
  input: CreateEmployeeRequest & { role?: string },
  actor: AccessTokenPayload,
) {
  const existing = await repo.findEmployeeByEmail(orgId, input.email);
  if (existing) {
    throw new DomainError("EMAIL_TAKEN", "An employee with this email already exists.", 409);
  }

  if (input.managerId) {
    await validateManagerAssignment(orgId, null, input.managerId);
  }
  await assertLookupsInOrg(orgId, input);

  const employeeCode = await generateEmployeeCode(orgId);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST);

  const employee = await repo.createEmployee({
    orgId,
    employeeCode,
    name: input.name,
    email: input.email.toLowerCase(),
    departmentId: input.departmentId,
    designationId: input.designationId,
    managerId: input.managerId ?? null,
    dateOfJoining: moment.utc(input.dateOfJoining).toDate(),
    user: {
      create: {
        orgId,
        email: input.email.toLowerCase(),
        passwordHash,
        role: input.role ?? "EMPLOYEE",
        // The temporary password must be replaced at first sign-in.
        mustChangePassword: true,
      },
    },
  } as never);

  await repo.writeActivityLog({
    orgId,
    actorId: actor.employeeId ?? employee.id,
    action: "employee.created",
    entity: "Employee",
    entityId: employee.id,
    after: { employeeCode, name: employee.name, email: employee.email },
  });

  for (const hook of employeeCreatedHooks) {
    try {
      await hook(orgId, employee.id, actor);
    } catch (err) {
      // The employee record stands; HR can attach e.g. the checklist manually (007 FR-005).
      logger.error({ err, employeeId: employee.id }, "employee-created hook failed");
    }
  }

  return { ...employee, temporaryPassword };
}

export async function getEmployee(orgId: string, id: string, requester: AccessTokenPayload) {
  const employee = await getEmployeeScoped(orgId, id, requester);
  const [decorated] = await decorate(orgId, [employee], requester);
  return decorated ?? employee;
}

async function getEmployeeScoped(orgId: string, id: string, requester: AccessTokenPayload) {
  const employee = await repo.findEmployeeById(orgId, id);
  if (!employee) {
    throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  }

  if (requester.role === "ADMIN" || requester.role === "HR") {
    return employee;
  }
  if (requester.role === "MANAGER") {
    if (employee.id === requester.employeeId || employee.managerId === requester.employeeId) {
      return employee;
    }
    throw new DomainError("FORBIDDEN", "You don't have permission to view this employee.", 403);
  }
  // EMPLOYEE
  if (employee.id === requester.employeeId) {
    return employee;
  }
  throw new DomainError("FORBIDDEN", "You don't have permission to view this employee.", 403);
}

export async function listEmployeesForRequester(
  orgId: string,
  requester: AccessTokenPayload,
  filters: { department?: string; designation?: string; status?: string } = {},
) {
  // Default to active-only, matching spec User Story 3's "offboarded employees no longer
  // appear in active employee lists" — callers can still explicitly ask for OFFBOARDED (or
  // any other status value) to see them.
  const where = {
    status: (filters.status ?? "ACTIVE") as never,
    ...(filters.department ? { departmentId: filters.department } : {}),
    ...(filters.designation ? { designationId: filters.designation } : {}),
  };

  if (requester.role === "ADMIN" || requester.role === "HR") {
    return decorate(orgId, await repo.listEmployees(orgId, where), requester);
  }
  if (requester.role === "MANAGER") {
    return decorate(orgId, await repo.listEmployees(orgId, { ...where, managerId: requester.employeeId }), requester);
  }
  // EMPLOYEE: self only
  if (!requester.employeeId) return [];
  const self = await repo.findEmployeeById(orgId, requester.employeeId);
  return self ? [self] : [];
}

export async function searchDirectory(
  orgId: string,
  filters: { q?: string; department?: string; designation?: string } = {},
) {
  const where = {
    status: "ACTIVE" as never,
    ...(filters.department ? { departmentId: filters.department } : {}),
    ...(filters.designation ? { designationId: filters.designation } : {}),
    ...(filters.q ? { name: { contains: filters.q, mode: "insensitive" as const } } : {}),
  };
  const employees = await repo.listEmployees(orgId, where);
  return employees.map(toDirectoryEntry);
}

export async function updateEmployee(
  orgId: string,
  id: string,
  input: UpdateEmployeeRequest,
  actor: AccessTokenPayload,
) {
  const existing = await repo.findEmployeeById(orgId, id);
  if (!existing) {
    throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  }

  if (input.managerId) {
    await validateManagerAssignment(orgId, id, input.managerId);
  }
  await assertLookupsInOrg(orgId, input);

  const before = {
    departmentId: existing.departmentId,
    designationId: existing.designationId,
    managerId: existing.managerId,
  };

  const updated = await repo.updateEmployee(id, {
    ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
    ...(input.designationId !== undefined ? { designationId: input.designationId } : {}),
    ...(input.managerId !== undefined ? { managerId: input.managerId } : {}),
  });

  await repo.writeActivityLog({
    orgId,
    actorId: actor.employeeId ?? id,
    action: "employee.updated",
    entity: "Employee",
    entityId: id,
    before,
    after: {
      departmentId: updated.departmentId,
      designationId: updated.designationId,
      managerId: updated.managerId,
    },
  });

  return updated;
}

// 004-payroll research.md R4: proration for an employee offboarded mid-period needs a "last
// active day" cutoff. Employee has no dedicated offboarded-on field (that would be a schema
// change to a table this module owns, made on 004's behalf — not appropriate to add
// unilaterally from 004's planning); reusing the audit row this module already writes avoids a
// redundant field that could drift from the audit trail's own timestamp. Read-only; does not
// change offboardEmployee's own behavior.
export async function getOffboardedDate(orgId: string, employeeId: string): Promise<Date | null> {
  const entry = await repo.findOffboardActivityLog(orgId, employeeId);
  return entry?.createdAt ?? null;
}

// Unscoped, minimal read for other modules' own authorization checks (e.g. 005's "Manager of the
// posting's department"). Callers apply their own RBAC — never return this to a client as-is.
export async function getEmployeeSummary(orgId: string, employeeId: string) {
  const employee = await repo.findEmployeeById(orgId, employeeId);
  if (!employee) return null;
  return {
    id: employee.id,
    name: employee.name,
    email: employee.email,
    status: employee.status,
    departmentId: employee.departmentId,
    managerId: employee.managerId,
    dateOfJoining: employee.dateOfJoining,
  };
}

// Active employees as summaries, for org-wide features (e.g. 008 policy acknowledgment tracking).
export async function listActiveEmployeeSummaries(orgId: string) {
  const employees = await repo.listEmployees(orgId, { status: "ACTIVE" });
  return employees.map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    departmentId: e.departmentId,
    designationId: e.designationId,
    managerId: e.managerId,
    dateOfJoining: e.dateOfJoining,
  }));
}

export async function listDirectReportIds(orgId: string, managerId: string) {
  const reports = await repo.listEmployees(orgId, { managerId, status: "ACTIVE" });
  return reports.map((r) => r.id);
}

// Bulk read for 011 analytics: every employee (incl. offboarded) with their offboarding date.
export async function listEmployeesForAnalytics(orgId: string) {
  const [employees, offboards] = await Promise.all([repo.listAllEmployees(orgId), repo.findOffboardDates(orgId)]);
  const offboardedAt = new Map(offboards.map((o) => [o.entityId, o.createdAt])); // latest wins (asc order)
  return employees.map((e) => ({ ...e, offboardedAt: e.status === "OFFBOARDED" ? offboardedAt.get(e.id) ?? null : null }));
}

// 015 FR-008: usage figure for the platform tier (a count, never records).
export async function countActiveEmployees(orgId: string) {
  return (await repo.listEmployees(orgId, { status: "ACTIVE" })).length;
}

// 021: match a hired candidate to their employee record by email.
export async function findEmployeeSummaryByEmail(orgId: string, email: string) {
  const e = await repo.findEmployeeByEmail(orgId, email);
  return e ? getEmployeeSummary(orgId, e.id) : null;
}

export async function offboardEmployee(orgId: string, id: string, actor: AccessTokenPayload) {
  const existing = await repo.findEmployeeById(orgId, id);
  if (!existing) {
    throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  }
  if (existing.status === "OFFBOARDED") {
    throw new DomainError("ALREADY_OFFBOARDED", "This employee is already offboarded.", 409);
  }

  const updated = await repo.updateEmployee(id, { status: "OFFBOARDED" });

  if (existing.user?.id) {
    await revokeAllSessionsForUser(existing.user.id);
  }

  await repo.writeActivityLog({
    orgId,
    actorId: actor.employeeId ?? id,
    action: "employee.offboarded",
    entity: "Employee",
    entityId: id,
    before: { status: "ACTIVE" },
    after: { status: "OFFBOARDED" },
  });

  for (const hook of employeeOffboardedHooks) {
    try {
      await hook(orgId, id, actor);
    } catch (err) {
      logger.error({ err, employeeId: id }, "employee-offboarded hook failed");
    }
  }

  return { id: updated.id, status: updated.status };
}

export async function getTeamView(orgId: string, requester: AccessTokenPayload) {
  if (!requester.employeeId) {
    return { manager: null, directReports: [] };
  }

  const self = await repo.findEmployeeById(orgId, requester.employeeId);
  const manager = self?.managerId ? await repo.findEmployeeById(orgId, self.managerId) : null;
  const directReports = await repo.listEmployees(orgId, { managerId: requester.employeeId });

  return {
    manager: manager ? toDirectoryEntry(manager) : null,
    directReports: directReports.map(toDirectoryEntry),
  };
}

export async function listDepartments(orgId: string) {
  return repo.findDepartments(orgId);
}

export async function createDepartment(orgId: string, name: string) {
  const existing = (await repo.findDepartments(orgId)).find((d) => d.name === name);
  if (existing) {
    throw new DomainError("DEPARTMENT_EXISTS", "A department with this name already exists.", 409);
  }
  return repo.createDepartment(orgId, name);
}

// 016 FR-008: department heads are set here (002 owns departments); the org chart only reads.
export async function setDepartmentHead(orgId: string, departmentId: string, headEmployeeId: string | null, actor: AccessTokenPayload) {
  if (!(await repo.departmentInOrg(orgId, departmentId))) throw new DomainError("NOT_FOUND", "Department not found.", 404);
  if (headEmployeeId) {
    const head = await repo.findEmployeeById(orgId, headEmployeeId);
    if (!head || head.status !== "ACTIVE") {
      throw new DomainError("VALIDATION_ERROR", "The department head must be an active employee.", 400, { headEmployeeId: ["Not an active employee."] });
    }
  }
  const updated = await repo.updateDepartment(departmentId, { headEmployeeId });
  await repo.writeActivityLog({ orgId, actorId: actor.employeeId ?? headEmployeeId ?? departmentId, action: "department.head_set", entity: "Department", entityId: departmentId, after: { headEmployeeId } });
  return updated;
}

export async function listDesignations(orgId: string) {
  return repo.findDesignations(orgId);
}

export async function createDesignation(orgId: string, title: string, level?: number) {
  const existing = (await repo.findDesignations(orgId)).find((d) => d.title === title);
  if (existing) {
    throw new DomainError("DESIGNATION_EXISTS", "A designation with this title already exists.", 409);
  }
  return repo.createDesignation(orgId, title, level);
}
