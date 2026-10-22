// Business rules for SSO and MFA. Framework-agnostic — no req/res.
// Implements specs/013-sso-mfa/spec.md; extends 001's sign-in through auth's login-policy hook.
import { randomBytes } from "node:crypto";
import { DomainError } from "../../middleware/errorHandler.js";
import { open, seal } from "../../lib/secretBox.js";
import { generateSecret, otpauthUrl, verifyCode } from "../../lib/totp.js";
import { verifyMfaToken } from "../../lib/jwt.js";
import {
  completeSignIn,
  getUserAuthState,
  getUserAuthStateByEmail,
  listUsableBreakGlassAdmins,
  setBreakGlass,
  type LoginPolicy,
} from "../auth/service.js";
import * as repo from "./repository.js";
import { getOidcProvider, pkcePair, providerConfigured, type VerifiedIdentity } from "./oidc.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import type { Provider } from "./schema.js";

export const MAX_FAILED_CODES = 5;
export const MFA_LOCK_MS = 15 * 60 * 1000;

async function audit(orgId: string, actor: AccessTokenPayload | { employeeId: string | null }, action: string, entityId: string, after?: unknown) {
  if (!actor.employeeId) return;
  await repo.writeActivityLog({ orgId, actorId: actor.employeeId, action, entity: "User", entityId, after });
}

// --- Login policy (registered with auth.setLoginPolicy in app.ts) ---

// FR-004/005: SSO enforcement blocks password sign-in except for break-glass accounts.
// FR-008/009: an enrolled account must verify a code; if MFA is required, an unenrolled one must
// enroll first. Break-glass accounts still get MFA if they've enrolled.
export const loginPolicy: LoginPolicy = async (orgId, user) => {
  const [config, enrollment] = await Promise.all([repo.findConfig(orgId), repo.findEnrollment(user.id)]);
  const passwordAllowed = !(config?.enforced && config.provider) || user.isBreakGlass;
  const enrolled = Boolean(enrollment?.confirmedAt && enrollment.secret);
  return { passwordAllowed, mfa: enrolled ? "VERIFY" : config?.mfaRequired ? "ENROLL" : "NONE" };
};

// --- MFA (US3) ---

export async function mfaStatus(orgId: string, userId: string) {
  const [enrollment, config] = await Promise.all([repo.findEnrollment(userId), repo.findConfig(orgId)]);
  return {
    enrolled: Boolean(enrollment?.confirmedAt),
    pending: Boolean(enrollment?.pendingSecret),
    required: Boolean(config?.mfaRequired),
  };
}

// FR-007: a fresh secret, held as "pending" until a code from it is confirmed.
export async function startEnrollment(orgId: string, userId: string, email: string) {
  const existing = await repo.findEnrollment(userId);
  if (existing?.confirmedAt) {
    throw new DomainError("MFA_ALREADY_ENROLLED", "MFA is already set up. Ask HR/Admin to reset it if you lost your device.", 409);
  }
  const secret = generateSecret();
  await repo.upsertPendingEnrollment(orgId, userId, seal(secret));
  return { secret, otpauthUrl: otpauthUrl(secret, email) };
}

// Edge case: a code that doesn't match the pending secret fails clearly; the pending secret
// stays so the user can retry, and nothing is enrolled.
export async function confirmEnrollment(orgId: string, userId: string, code: string, actor: { employeeId: string | null }) {
  const enrollment = await repo.findEnrollment(userId);
  if (!enrollment?.pendingSecret) {
    throw new DomainError("NO_PENDING_ENROLLMENT", "Start MFA setup first.", 409);
  }
  const step = verifyCode(open(enrollment.pendingSecret), code);
  if (step === null) {
    throw new DomainError("INVALID_CODE", "That code doesn't match. Check your authenticator app's time and try again.", 400);
  }
  await repo.updateEnrollment(userId, {
    secret: enrollment.pendingSecret,
    pendingSecret: null,
    confirmedAt: new Date(),
    enrolledAt: new Date(),
    lastUsedStep: step,
    failedAttempts: 0,
    lockedUntil: null,
  });
  await audit(orgId, actor, "auth.mfa_enrolled", userId);
}

// FR-008/FR-011: valid, unused code required; consecutive failures lock MFA for a while.
export async function verifySecondFactor(userId: string, code: string, now = new Date()) {
  const enrollment = await repo.findEnrollment(userId);
  if (!enrollment?.confirmedAt || !enrollment.secret) {
    throw new DomainError("MFA_NOT_ENROLLED", "MFA isn't set up for this account.", 409);
  }
  if (enrollment.lockedUntil && enrollment.lockedUntil > now) {
    throw new DomainError("MFA_LOCKED", "Too many incorrect codes. Try again in a few minutes.", 429);
  }
  const step = verifyCode(open(enrollment.secret), code, { now: now.getTime() });
  // A step at or before the last accepted one is a replay.
  if (step === null || (enrollment.lastUsedStep !== null && step <= enrollment.lastUsedStep)) {
    const failed = enrollment.failedAttempts + 1;
    const lock = failed >= MAX_FAILED_CODES;
    await repo.updateEnrollment(userId, lock ? { failedAttempts: 0, lockedUntil: new Date(now.getTime() + MFA_LOCK_MS) } : { failedAttempts: failed });
    throw new DomainError(lock ? "MFA_LOCKED" : "INVALID_CODE", lock ? "Too many incorrect codes. Try again in a few minutes." : "Incorrect or expired code.", lock ? 429 : 401);
  }
  await repo.updateEnrollment(userId, { failedAttempts: 0, lockedUntil: null, lastUsedStep: step });
}

// FR-010: HR/Admin reset after a lost device; the user re-enrolls on next sign-in if required.
export async function resetMfa(orgId: string, userId: string, actor: AccessTokenPayload) {
  if (!(await getUserAuthState(orgId, userId))) throw new DomainError("NOT_FOUND", "User not found.", 404);
  await repo.deleteEnrollment(userId);
  await audit(orgId, actor, "auth.mfa_reset", userId);
}

// --- Second step of a password sign-in (mfaToken from POST /auth/login) ---

async function userFromMfaToken(mfaToken: string) {
  let sub: string;
  let orgId: string;
  let deviceId: string | undefined;
  try {
    ({ sub, orgId, deviceId } = verifyMfaToken(mfaToken));
  } catch {
    throw new DomainError("INVALID_SESSION", "Your sign-in attempt expired. Please sign in again.", 401);
  }
  const user = await getUserAuthState(orgId, sub);
  if (!user || !user.active) throw new DomainError("INVALID_SESSION", "Your sign-in attempt expired. Please sign in again.", 401);
  if (user.locked) throw new DomainError("ACCOUNT_LOCKED", "This account is locked. Contact an administrator to unlock it.", 403);
  return { ...user, orgId, deviceId: deviceId ?? null };
}

// 015: the org comes from the signed challenge token, not the request.
export async function completeMfaSignIn(mfaToken: string, code: string) {
  const user = await userFromMfaToken(mfaToken);
  await verifySecondFactor(user.id, code);
  return completeSignIn(user.orgId, user.id, "mfa", user.deviceId);
}

export async function startEnrollmentFromChallenge(mfaToken: string) {
  const user = await userFromMfaToken(mfaToken);
  return startEnrollment(user.orgId, user.id, user.email);
}

export async function confirmEnrollmentFromChallenge(mfaToken: string, code: string) {
  const user = await userFromMfaToken(mfaToken);
  await confirmEnrollment(user.orgId, user.id, code, { employeeId: user.employeeId });
  return completeSignIn(user.orgId, user.id, "mfa", user.deviceId);
}

// --- Settings & break-glass (US1.3, US2) ---

export async function getSettings(orgId: string) {
  const [config, breakGlass] = await Promise.all([repo.findConfig(orgId), listUsableBreakGlassAdmins(orgId)]);
  const provider = (config?.provider ?? null) as Provider | null;
  return {
    provider,
    providerCredentialsConfigured: provider ? providerConfigured(provider) : false,
    enforced: Boolean(config?.enforced),
    mfaRequired: Boolean(config?.mfaRequired),
    breakGlassAccounts: breakGlass,
  };
}

export async function updateSettings(
  orgId: string,
  input: { provider?: Provider | null; enforced?: boolean; mfaRequired?: boolean },
  actor: AccessTokenPayload,
) {
  const current = await repo.findConfig(orgId);
  const next = {
    provider: input.provider !== undefined ? input.provider : (current?.provider ?? null),
    enforced: input.enforced ?? current?.enforced ?? false,
    mfaRequired: input.mfaRequired ?? current?.mfaRequired ?? false,
  };
  if (next.enforced) {
    if (!next.provider) throw new DomainError("SSO_NOT_CONFIGURED", "Configure an identity provider before enforcing SSO.", 409);
    // FR-005 / SC-005: never leave the company without a working sign-in path.
    if ((await listUsableBreakGlassAdmins(orgId)).length === 0) {
      throw new DomainError("BREAK_GLASS_REQUIRED", "Designate at least one active Admin as a break-glass account before enforcing SSO.", 409);
    }
  }
  await repo.upsertConfig(orgId, { ...next, updatedById: actor.employeeId });
  await audit(orgId, actor, "auth.identity_settings_changed", orgId, next);
  return getSettings(orgId);
}

export async function setBreakGlassAccount(orgId: string, userId: string, enabled: boolean, actor: AccessTokenPayload) {
  const user = await getUserAuthState(orgId, userId);
  if (!user) throw new DomainError("NOT_FOUND", "User not found.", 404);
  if (enabled && user.role !== "ADMIN") {
    throw new DomainError("VALIDATION_ERROR", "Only Admin accounts can be break-glass accounts.", 400, { userId: ["Must be an Admin."] });
  }
  if (!enabled) {
    const config = await repo.findConfig(orgId);
    const others = (await listUsableBreakGlassAdmins(orgId)).filter((b) => b.userId !== userId);
    if (config?.enforced && others.length === 0) {
      throw new DomainError("BREAK_GLASS_REQUIRED", "This is the last break-glass account while SSO is enforced.", 409);
    }
  }
  await setBreakGlass(userId, enabled);
  await audit(orgId, actor, enabled ? "auth.break_glass_granted" : "auth.break_glass_revoked", userId);
  return getSettings(orgId);
}

// --- SSO (US1) ---

export function ssoRedirectUri(): string {
  const base = (process.env.PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
  return `${base}/api/auth/sso/callback`;
}

// Builds the provider redirect plus the state we must see again on the callback.
export async function startSso(orgId: string) {
  const config = await repo.findConfig(orgId);
  const provider = config?.provider as Provider | null | undefined;
  if (!provider) throw new DomainError("SSO_NOT_CONFIGURED", "Single sign-on isn't set up for this company.", 404);
  const client = getOidcProvider(provider);
  if (!client) throw new DomainError("SSO_NOT_CONFIGURED", "Single sign-on credentials aren't configured on the server.", 503);
  const state = randomBytes(16).toString("base64url");
  const nonce = randomBytes(16).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const url = client.authorizationUrl({ state, nonce, codeChallenge: challenge, redirectUri: ssoRedirectUri() });
  return { url, flow: { orgId, provider, state, nonce, codeVerifier: verifier } };
}

// FR-002/FR-003/SC-002 + the email-change edge case: match only by a verified email to an
// existing, active account; never create one; a link whose user's email has since changed fails.
export async function resolveSsoUser(orgId: string, provider: Provider, identity: VerifiedIdentity) {
  const link = await repo.findLink(provider, identity.sub);
  if (link) {
    const user = await getUserAuthState(orgId, link.userId);
    if (!user || user.email.toLowerCase() !== identity.email) {
      throw new DomainError("SSO_EMAIL_MISMATCH", "Your company account's email no longer matches your employee record. Contact HR.", 403);
    }
    return user;
  }
  if (!identity.emailVerified) {
    throw new DomainError("SSO_EMAIL_UNVERIFIED", "Your identity provider hasn't verified this email address.", 403);
  }
  const user = await getUserAuthStateByEmail(orgId, identity.email);
  if (!user) {
    throw new DomainError("NO_MATCHING_EMPLOYEE", "There's no employee record for this account. Ask HR to add you first.", 403);
  }
  await repo.createLink({ orgId, userId: user.id, provider, externalId: identity.sub, email: identity.email });
  return user;
}

export async function finishSso(
  orgId: string,
  flow: { provider: Provider; state: string; nonce: string; codeVerifier: string },
  callback: { code?: string; state?: string },
) {
  if (!callback.code || !callback.state || callback.state !== flow.state) {
    throw new DomainError("SSO_STATE_MISMATCH", "This sign-in link expired or was tampered with. Please try again.", 400);
  }
  const config = await repo.findConfig(orgId);
  if (config?.provider !== flow.provider) throw new DomainError("SSO_NOT_CONFIGURED", "Single sign-on isn't set up for this company.", 404);
  const client = getOidcProvider(flow.provider);
  if (!client) throw new DomainError("SSO_NOT_CONFIGURED", "Single sign-on credentials aren't configured on the server.", 503);

  let identity: VerifiedIdentity;
  try {
    identity = await client.exchangeCode({ code: callback.code, codeVerifier: flow.codeVerifier, redirectUri: ssoRedirectUri(), nonce: flow.nonce });
  } catch {
    throw new DomainError("SSO_FAILED", "We couldn't verify your sign-in with the identity provider. Please try again.", 401);
  }
  const user = await resolveSsoUser(orgId, flow.provider, identity);
  if (!user.active) throw new DomainError("NO_MATCHING_EMPLOYEE", "There's no active employee record for this account.", 403);
  if (user.locked) throw new DomainError("ACCOUNT_LOCKED", "This account is locked. Contact an administrator to unlock it.", 403);
  return completeSignIn(orgId, user.id, "sso");
}
