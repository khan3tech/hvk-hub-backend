// Business rules for the auth module. Framework-agnostic — no req/res.
// Calls repository.ts for persistence; never imports Prisma directly.
// Implements the functional requirements (FR-xxx) in specs/001-auth-rbac/spec.md.
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import moment from "moment";
import { DomainError } from "../../middleware/errorHandler.js";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyToken,
  signMfaToken,
  REFRESH_TOKEN_TTL_MS,
  type AccessTokenPayload,
  type RefreshTokenPayload,
} from "../../lib/jwt.js";
import * as repo from "./repository.js";
import type { LoginRequest } from "./schema.js";
import type { Role } from "../../lib/roles.js";

const BCRYPT_COST = 12;
const LOCKOUT_THRESHOLD = Number(process.env.AUTH_LOCKOUT_THRESHOLD ?? 3);

function getSecret(name: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

// Written as an Employee-attributed audit entry (constitution Principle IV). Admin/HR
// system accounts without a linked Employee record (spec § Key Entities) can't be
// attributed this way yet — skip the write rather than crash the request on it. This is a
// known gap flagged in data-model.md, not a silent decision made here.
async function logActivity(params: {
  orgId: string;
  actorEmployeeId: string | null;
  action: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}) {
  if (!params.actorEmployeeId) return;
  await repo.writeActivityLog({
    orgId: params.orgId,
    actorId: params.actorEmployeeId,
    action: params.action,
    entity: "User",
    entityId: params.entityId,
    before: params.before,
    after: params.after,
  });
}

async function issueSession(orgId: string, userId: string, deviceId: string | null = null) {
  const refreshJwt = signRefreshToken({ sub: userId }, getSecret("JWT_REFRESH_SECRET"));
  const expiresAt = moment().add(REFRESH_TOKEN_TTL_MS, "milliseconds").toDate();
  await repo.createRefreshToken({
    orgId,
    userId,
    tokenHash: hashToken(refreshJwt),
    expiresAt,
    deviceId,
  });
  return { refreshJwt, expiresAt };
}

// 013-sso-mfa decides, after a correct password, whether password sign-in is allowed (SSO
// enforcement / break-glass) and whether a second factor is needed. Registered in app.ts.
export type LoginPolicy = (
  orgId: string,
  user: { id: string; role: string; isBreakGlass: boolean; employeeId: string | null },
) => Promise<{ passwordAllowed: boolean; mfa: "NONE" | "VERIFY" | "ENROLL" }>;
let loginPolicy: LoginPolicy | null = null;

export function setLoginPolicy(policy: LoginPolicy | null): void {
  loginPolicy = policy;
}

// The single place a session is issued, for password, MFA-completed and SSO sign-ins alike.
export async function completeSignIn(orgId: string, userId: string, method: "password" | "mfa" | "sso", deviceId: string | null = null) {
  const user = await repo.findUserById(orgId, userId);
  if (!user) throw new DomainError("INVALID_CREDENTIALS", "Invalid email or password.", 401);
  return signInUser(orgId, user, method, deviceId);
}

async function signInUser(
  orgId: string,
  user: { id: string; email: string; role: string; employeeId: string | null; mustChangePassword?: boolean },
  method: "password" | "mfa" | "sso",
  deviceId: string | null = null,
) {
  // 001 FR-013: a (web) sign-in ends every other session. 019 FR-009: an installed-app device
  // that identifies itself only replaces its own previous session, so devices stay independent.
  if (deviceId) await repo.revokeDeviceRefreshTokens(user.id, deviceId);
  else await repo.revokeAllRefreshTokensForUser(user.id);
  const { refreshJwt } = await issueSession(orgId, user.id, deviceId);

  const accessPayload: AccessTokenPayload = {
    sub: user.id,
    role: user.role as AccessTokenPayload["role"],
    employeeId: user.employeeId,
    orgId,
    ...(user.mustChangePassword ? { pwc: true } : {}),
  };
  const accessToken = signAccessToken(accessPayload, getSecret("JWT_ACCESS_SECRET"));

  await logActivity({
    orgId,
    actorEmployeeId: user.employeeId,
    action: "auth.sign_in",
    entityId: user.id,
    after: { at: moment().toISOString(), method },
  });

  return {
    accessToken,
    refreshToken: refreshJwt,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId,
      mustChangePassword: Boolean(user.mustChangePassword),
    },
  };
}

// 015: organizations live in their own module; auth asks through this directory (registered in
// app.ts) so it never imports it. Without one (tests), every org counts as active.
export interface OrganizationDirectory {
  idForSlug(slug: string): Promise<string | null>;
  isActive(orgId: string): Promise<boolean>;
}
let orgDirectory: OrganizationDirectory | null = null;

export function setOrganizationDirectory(directory: OrganizationDirectory | null): void {
  orgDirectory = directory;
}

export async function resolveOrganizationSlug(slug: string): Promise<string | null> {
  return orgDirectory ? orgDirectory.idForSlug(slug) : slug;
}

async function assertOrgActive(orgId: string) {
  if (orgDirectory && !(await orgDirectory.isActive(orgId))) {
    throw new DomainError("ORGANIZATION_SUSPENDED", "Your organization's access is suspended. Contact your administrator.", 403);
  }
}

// 015 FR-002: the org is found from the email (unique per org); an email present in several orgs
// needs the organization slug to disambiguate.
async function findLoginUser(input: LoginRequest) {
  let candidates = await repo.findUsersByEmailAnyOrg(input.email);
  if (input.organization) {
    const orgId = await resolveOrganizationSlug(input.organization);
    candidates = candidates.filter((u) => u.orgId === orgId);
  }
  if (candidates.length > 1) {
    throw new DomainError("ORGANIZATION_REQUIRED", "This email is used in more than one organization. Choose your organization.", 400, {
      organization: ["Required for this email."],
    });
  }
  return candidates[0] ?? null;
}

export async function login(input: LoginRequest) {
  const user = await findLoginUser(input);

  // Same generic message/code whether the email doesn't exist or the password is wrong
  // (spec FR-001, Edge Cases) — checked before the lock check so a wrong password against a
  // locked account still can't be distinguished from a wrong password against an unlocked one.
  if (!user) {
    throw new DomainError("INVALID_CREDENTIALS", "Invalid email or password.", 401);
  }

  if (user.lockedAt) {
    throw new DomainError(
      "ACCOUNT_LOCKED",
      "This account is locked. Contact an administrator to unlock it.",
      403,
    );
  }

  const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordOk) {
    const updated = await repo.incrementFailedAttempts(user.id);
    if (updated.failedLoginAttempts >= LOCKOUT_THRESHOLD) {
      await repo.lockUser(user.id);
    }
    throw new DomainError("INVALID_CREDENTIALS", "Invalid email or password.", 401);
  }

  if (user.employee?.status === "OFFBOARDED") {
    throw new DomainError("INVALID_CREDENTIALS", "Invalid email or password.", 401);
  }

  const orgId = user.orgId;
  await assertOrgActive(orgId); // 015 FR-007

  const policy = loginPolicy
    ? await loginPolicy(orgId, { id: user.id, role: user.role, isBreakGlass: user.isBreakGlass, employeeId: user.employeeId })
    : { passwordAllowed: true, mfa: "NONE" as const };
  if (!policy.passwordAllowed) {
    throw new DomainError(
      "SSO_REQUIRED",
      "Your company signs in with single sign-on. Use the Google/Microsoft sign-in button instead.",
      403,
    );
  }

  await repo.resetFailedAttempts(user.id);

  // 013 FR-008/FR-009: password OK, but no session until the second factor is done.
  if (policy.mfa !== "NONE") {
    return { mfaRequired: true as const, enrollmentRequired: policy.mfa === "ENROLL", mfaToken: signMfaToken(user.id, orgId, input.deviceId) };
  }

  return signInUser(orgId, user, "password", input.deviceId ?? null);
}

export async function refresh(rawRefreshToken: string) {
  let payload: RefreshTokenPayload;
  try {
    payload = verifyToken<RefreshTokenPayload>(rawRefreshToken, getSecret("JWT_REFRESH_SECRET"));
  } catch {
    throw new DomainError("INVALID_SESSION", "Session expired. Please sign in again.", 401);
  }

  const tokenHash = hashToken(rawRefreshToken);
  const stored = await repo.findActiveRefreshTokenByHash(tokenHash);
  if (!stored || stored.userId !== payload.sub) {
    throw new DomainError("INVALID_SESSION", "Session expired. Please sign in again.", 401);
  }
  const orgId = stored.user.orgId;
  await assertOrgActive(orgId); // 015 FR-007: suspension also stops silent renewal

  if (stored.user.lockedAt) {
    throw new DomainError(
      "ACCOUNT_LOCKED",
      "This account is locked. Contact an administrator to unlock it.",
      403,
    );
  }
  if (stored.user.employee?.status === "OFFBOARDED") {
    throw new DomainError("INVALID_SESSION", "Session expired. Please sign in again.", 401);
  }

  // Rotate: revoke the presented token, issue a new one — limits the replay window of a
  // stolen refresh token (contracts/auth-api.md § POST /auth/refresh).
  await repo.revokeRefreshToken(stored.id);
  const { refreshJwt } = await issueSession(orgId, stored.userId, stored.deviceId);

  const accessPayload: AccessTokenPayload = {
    sub: stored.userId,
    role: stored.user.role as AccessTokenPayload["role"],
    employeeId: stored.user.employeeId,
    orgId,
    ...(stored.user.mustChangePassword ? { pwc: true } : {}),
  };
  const accessToken = signAccessToken(accessPayload, getSecret("JWT_ACCESS_SECRET"));

  return { accessToken, refreshToken: refreshJwt };
}

export async function logout(rawRefreshToken: string | undefined) {
  if (!rawRefreshToken) return;
  const tokenHash = hashToken(rawRefreshToken);
  const stored = await repo.findActiveRefreshTokenByHash(tokenHash);
  if (stored) {
    await repo.revokeRefreshToken(stored.id);
  }
}

// Exported so other modules (e.g. 002-employee-management, on marking an Employee
// OFFBOARDED) can revoke that user's sessions without reaching into auth's repository
// directly (constitution Principle I) — FR-010.
export async function revokeAllSessionsForUser(userId: string) {
  await repo.revokeAllRefreshTokensForUser(userId);
}

export async function getUserById(orgId: string, userId: string) {
  const user = await repo.findUserById(orgId, userId);
  if (!user) return null;
  return { id: user.id, email: user.email, role: user.role, employeeId: user.employeeId, mustChangePassword: user.mustChangePassword };
}

// --- Passwords ---

// At least 8 characters with a letter and a number; not the same as the current one.
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 128) return "Use at most 128 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use at least one letter and one number.";
  return null;
}

// The signed-in user replaces their password (required after a temporary one). Every other
// session ends; this device gets a fresh session without the change-required flag.
export async function changePassword(orgId: string, userId: string, currentPassword: string, newPassword: string) {
  const user = await repo.findUserById(orgId, userId);
  if (!user) throw new DomainError("UNAUTHENTICATED", "Sign-in required.", 401);
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new DomainError("WRONG_PASSWORD", "Your current password is incorrect.", 400, { currentPassword: ["Incorrect password."] });
  }
  const problem = passwordProblem(newPassword);
  if (problem) throw new DomainError("WEAK_PASSWORD", problem, 400, { newPassword: [problem] });
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    throw new DomainError("SAME_PASSWORD", "Choose a password different from your current one.", 400, { newPassword: ["Must differ from the current password."] });
  }
  const updated = await repo.setPassword(user.id, await bcrypt.hash(newPassword, 12), false);
  await logActivity({ orgId, actorEmployeeId: user.employeeId, action: "auth.password_changed", entityId: user.id, after: { at: moment().toISOString() } });
  return signInUser(orgId, updated, "password");
}

// HR/Admin issue a new temporary password for an employee's account: it must be changed at the
// next sign-in, the account is unlocked, and every session of that user ends.
export async function resetPasswordForEmployee(orgId: string, employeeId: string, actor: AccessTokenPayload) {
  const target = await repo.findUserByEmployeeId(orgId, employeeId);
  if (!target) throw new DomainError("NOT_FOUND", "This employee has no sign-in account.", 404);
  if (target.id === actor.sub) throw new DomainError("OWN_ACCOUNT", "Use Change password for your own account.", 400);
  if (target.role === "ADMIN" && actor.role !== "ADMIN") throw new DomainError("FORBIDDEN", "Only an Admin can reset an Admin's password.", 403);
  const temporaryPassword = randomBytes(9).toString("base64url");
  await repo.setPassword(target.id, await bcrypt.hash(temporaryPassword, 12), true);
  await repo.unlockUser(target.id);
  await repo.revokeAllRefreshTokensForUser(target.id);
  await logActivity({ orgId, actorEmployeeId: actor.employeeId, action: "auth.password_reset", entityId: target.id, after: { at: moment().toISOString() } });
  return { email: target.email, temporaryPassword };
}

export async function unlockUser(orgId: string, targetUserId: string, actor: AccessTokenPayload) {
  const target = await repo.findUserById(orgId, targetUserId);
  if (!target) {
    throw new DomainError("NOT_FOUND", "User not found.", 404);
  }

  const wasLockedAt = target.lockedAt;
  const updated = await repo.unlockUser(target.id);

  await logActivity({
    orgId,
    actorEmployeeId: actor.employeeId,
    action: "auth.account_unlocked",
    entityId: target.id,
    before: { lockedAt: wasLockedAt },
    after: { lockedAt: null },
  });

  return { id: updated.id, lockedAt: null as null };
}

// Read helpers for other modules (e.g. 006 notifications routing) — never exposed directly.
export async function findUserForEmployee(orgId: string, employeeId: string) {
  const user = await repo.findUserByEmployeeId(orgId, employeeId);
  return user ? { id: user.id, role: user.role, email: user.email, employeeId: user.employeeId } : null;
}

export async function listUsersByRole(orgId: string, roles: Role[]) {
  return repo.findUsersByRoles(orgId, roles);
}

// --- Read/write helpers for 013-sso-mfa (identity module) — never exposed directly ---

function authState(user: NonNullable<Awaited<ReturnType<typeof repo.findUserById>>>) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    employeeId: user.employeeId,
    isBreakGlass: user.isBreakGlass,
    locked: Boolean(user.lockedAt),
    // An account without an employee record, or an offboarded one, can't sign in.
    active: user.employee?.status === "ACTIVE",
  };
}

export async function getUserAuthState(orgId: string, userId: string) {
  const user = await repo.findUserById(orgId, userId);
  return user ? authState(user) : null;
}

export async function getUserAuthStateByEmail(orgId: string, email: string) {
  const user = await repo.findUserByEmail(orgId, email);
  return user ? authState(user) : null;
}

export async function setBreakGlass(userId: string, isBreakGlass: boolean) {
  await repo.setBreakGlass(userId, isBreakGlass);
}

// Break-glass accounts that could actually sign in right now (FR-005, SC-005).
export async function listUsableBreakGlassAdmins(orgId: string) {
  const users = await repo.findBreakGlassUsers(orgId);
  return users
    .filter((u) => u.role === "ADMIN" && !u.lockedAt && u.employee?.status === "ACTIVE")
    .map((u) => ({ userId: u.id, email: u.email }));
}
