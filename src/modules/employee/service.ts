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

type OnboardingStatusProvider = (orgId: string, employeeIds: string[]) => Promise<Map<string, string>>;
let onboardingStatusProvider: OnboardingStatusProvider | null = null;

// 007 FR-007: directory/profile show IN_PROGRESS | COMPLETE | NONE.
export function setOnboardingStatusProvider(provider: OnboardingStatusProvider | null): void {
  onboardingStatusProvider = provider;
}

async function withOnboardingStatus<T extends { id: string }>(orgId: string, employees: T[]) {
  if (!onboardingStatusProvider || employees.length === 0) return employees;
  try {
    const statuses = await onboardingStatusProvider(
      orgId,
      employees.map((e) => e.id),
    );
    return employees.map((e) => ({ ...e, onboardingStatus: statuses.get(e.id) ?? "NONE" }));
  } catch (err) {
    logger.warn({ err }, "onboarding status lookup failed");
    return employees;
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
  const [decorated] = await withOnboardingStatus(orgId, [employee]);
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
    return withOnboardingStatus(orgId, await repo.listEmployees(orgId, where));
  }
  if (requester.role === "MANAGER") {
    return withOnboardingStatus(orgId, await repo.listEmployees(orgId, { ...where, managerId: requester.employeeId }));
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
    managerId: e.managerId,
    dateOfJoining: e.dateOfJoining,
  }));
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
