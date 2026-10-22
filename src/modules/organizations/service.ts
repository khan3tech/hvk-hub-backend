// Platform tier: organizations and the super-admins who operate them (specs/015).
// Super-admins are a separate tier (FR-005): their own table, token secret and routes; they
// manage organizations, never an organization's HR data.
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import moment from "moment";
import { Prisma } from "@prisma/client";
import { DomainError } from "../../middleware/errorHandler.js";
import { logger } from "../../lib/logger.js";
import { countActiveEmployees, createDepartment, createDesignation, createEmployee } from "../employee/service.js";
import type { OrganizationDirectory } from "../auth/service.js";
import * as repo from "./repository.js";
import type { CreateOrganizationRequest } from "./schema.js";

const LOCKOUT_THRESHOLD = 5;

export interface PlatformTokenPayload {
  sub: string;
  kind: "platform";
}

function platformSecret(): string {
  const base = process.env.JWT_ACCESS_SECRET;
  if (!base) throw new Error("JWT_ACCESS_SECRET is not configured");
  return `${base}:platform`;
}

export function verifyPlatformToken(token: string): PlatformTokenPayload {
  const payload = jwt.verify(token, platformSecret()) as PlatformTokenPayload;
  if (payload.kind !== "platform") throw new Error("not a platform token");
  return payload;
}

// --- Super-admin sign-in ---

export async function platformLogin(email: string, password: string) {
  const admin = await repo.findSuperAdminByEmail(email);
  if (!admin) throw new DomainError("INVALID_CREDENTIALS", "Invalid email or password.", 401);
  if (admin.lockedAt) throw new DomainError("ACCOUNT_LOCKED", "This operator account is locked.", 403);
  if (!(await bcrypt.compare(password, admin.passwordHash))) {
    await repo.recordSuperAdminFailure(admin.id, admin.failedLoginAttempts + 1 >= LOCKOUT_THRESHOLD);
    throw new DomainError("INVALID_CREDENTIALS", "Invalid email or password.", 401);
  }
  await repo.resetSuperAdminFailures(admin.id);
  const token = jwt.sign({ sub: admin.id, kind: "platform" } satisfies PlatformTokenPayload, platformSecret(), { expiresIn: "1h" });
  logger.info({ superAdminId: admin.id }, "platform sign-in");
  return { accessToken: token, superAdmin: { id: admin.id, email: admin.email } };
}

export async function requireSuperAdmin(id: string) {
  const admin = await repo.findSuperAdmin(id);
  if (!admin || admin.lockedAt) throw new DomainError("UNAUTHENTICATED", "Operator sign-in required.", 401);
  return admin;
}

// --- Organizations (US1, US3) ---

async function withUsage(org: NonNullable<Awaited<ReturnType<typeof repo.findOrganization>>>) {
  const [usage, activeEmployees] = await Promise.all([repo.usageFor(org.id), countActiveEmployees(org.id)]);
  return { ...org, usage: { activeEmployees, ...usage } };
}

// Modules holding per-organization data outside the database (e.g. 025 branding files) clean up
// here before an organization is deleted (025 FR-010). Registered in app.ts.
type OrganizationDeletedHook = (orgId: string) => Promise<void>;
const organizationDeletedHooks = new Set<OrganizationDeletedHook>();
export function onOrganizationDeleted(hook: OrganizationDeletedHook): void {
  organizationDeletedHooks.add(hook);
}

async function deleteOrganizationData(orgId: string) {
  for (const hook of organizationDeletedHooks) {
    try {
      await hook(orgId);
    } catch (err) {
      logger.error({ err, orgId }, "organization-deleted hook failed");
    }
  }
  await repo.deleteOrganization(orgId);
}

// Name and slug for organization-facing surfaces (025 branding, payslips). No usage figures.
export async function getOrganizationIdentity(id: string) {
  const org = await repo.findOrganization(id);
  return org ? { id: org.id, name: org.name, slug: org.slug, status: org.status } : null;
}

export async function listOrganizations() {
  return Promise.all((await repo.listOrganizations()).map(withUsage));
}

export async function getOrganization(id: string) {
  const org = await repo.findOrganization(id);
  if (!org) throw new DomainError("NOT_FOUND", "Organization not found.", 404);
  return withUsage(org);
}

// FR-001/SC-002: a new, empty organization with a first Admin who can sign in straight away
// (one-time temporary password, returned once). Starter lookups are created per org (FR-004).
export async function provisionOrganization(input: CreateOrganizationRequest, superAdminId: string) {
  let org;
  try {
    org = await repo.createOrganization({ name: input.name, slug: input.slug });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DomainError("SLUG_TAKEN", "Another organization already uses this slug.", 409);
    }
    throw err;
  }
  try {
    const department = await createDepartment(org.id, "General");
    const designation = await createDesignation(org.id, "Administrator");
    // The platform operator isn't an employee anywhere; the audit row is attributed to the new
    // admin's own record (employee service's existing fallback for actor-less creates).
    const operator = { sub: superAdminId, role: "ADMIN" as const, employeeId: null, orgId: org.id };
    const admin = await createEmployee(
      org.id,
      {
        name: input.adminName,
        email: input.adminEmail,
        departmentId: department.id,
        designationId: designation.id,
        dateOfJoining: moment.utc().format("YYYY-MM-DD"),
        role: "ADMIN",
      },
      operator,
    );
    logger.info({ orgId: org.id, superAdminId }, "organization provisioned");
    return { organization: org, admin: { employeeId: admin.id, email: admin.email, temporaryPassword: admin.temporaryPassword } };
  } catch (err) {
    // Don't leave a half-provisioned organization behind (a failed cleanup must not mask the cause).
    try {
      await deleteOrganizationData(org.id);
    } catch (cleanupErr) {
      logger.error({ err: cleanupErr, orgId: org.id }, "rollback of half-provisioned organization failed");
    }
    throw err;
  }
}

// FR-007/SC-003: takes effect on the next request (authenticate + sign-in + refresh all check).
export async function setOrganizationStatus(id: string, status: "ACTIVE" | "SUSPENDED", superAdminId: string) {
  if (!(await repo.findOrganization(id))) throw new DomainError("NOT_FOUND", "Organization not found.", 404);
  const org = await repo.setStatus(id, status);
  logger.info({ orgId: id, status, superAdminId }, "organization status changed");
  return withUsage(org);
}

// Registered with auth.setOrganizationDirectory() in app.ts.
export const organizationDirectory: OrganizationDirectory = {
  async idForSlug(slug) {
    return (await repo.findOrganizationBySlug(slug))?.id ?? null;
  },
  async isActive(orgId) {
    const org = await repo.findOrganization(orgId);
    // An org id with no Organization row predates 015's backfill — treat as active.
    return !org || org.status === "ACTIVE";
  },
};

// 016 FR-008: the designated top of an organization's chart (read/written by the org chart).
export async function getTopEmployeeId(orgId: string) {
  return (await repo.findOrganization(orgId))?.topEmployeeId ?? null;
}

export async function setTopEmployeeId(orgId: string, employeeId: string | null) {
  if (!(await repo.findOrganization(orgId))) throw new DomainError("NOT_FOUND", "Organization not found.", 404);
  await repo.setTopEmployee(orgId, employeeId);
}
