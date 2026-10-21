// Business rules for the auth module. Framework-agnostic — no req/res.
// Calls repository.ts for persistence; never imports Prisma directly.
// Implements the functional requirements (FR-xxx) in specs/001-auth-rbac/spec.md.
import bcrypt from "bcrypt";
import moment from "moment";
import { DomainError } from "../../middleware/errorHandler.js";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyToken,
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

async function issueSession(orgId: string, userId: string) {
  const refreshJwt = signRefreshToken({ sub: userId }, getSecret("JWT_REFRESH_SECRET"));
  const expiresAt = moment().add(REFRESH_TOKEN_TTL_MS, "milliseconds").toDate();
  await repo.createRefreshToken({
    orgId,
    userId,
    tokenHash: hashToken(refreshJwt),
    expiresAt,
  });
  return { refreshJwt, expiresAt };
}

export async function login(orgId: string, input: LoginRequest) {
  const user = await repo.findUserByEmail(orgId, input.email);

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

  await repo.resetFailedAttempts(user.id);
  // FR-013 (spec Clarifications 2026-09-14): only one active session per user — a new
  // sign-in ends any session already active on another device/browser.
  await repo.revokeAllRefreshTokensForUser(user.id);
  const { refreshJwt } = await issueSession(orgId, user.id);

  const accessPayload: AccessTokenPayload = {
    sub: user.id,
    role: user.role as AccessTokenPayload["role"],
    employeeId: user.employeeId,
  };
  const accessToken = signAccessToken(accessPayload, getSecret("JWT_ACCESS_SECRET"));

  await logActivity({
    orgId,
    actorEmployeeId: user.employeeId,
    action: "auth.sign_in",
    entityId: user.id,
    after: { at: moment().toISOString() },
  });

  return {
    accessToken,
    refreshToken: refreshJwt,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId,
    },
  };
}

export async function refresh(orgId: string, rawRefreshToken: string) {
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
  const { refreshJwt } = await issueSession(orgId, stored.userId);

  const accessPayload: AccessTokenPayload = {
    sub: stored.userId,
    role: stored.user.role as AccessTokenPayload["role"],
    employeeId: stored.user.employeeId,
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
  return { id: user.id, email: user.email, role: user.role, employeeId: user.employeeId };
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
