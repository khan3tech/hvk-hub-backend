import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import type { Role } from "./roles.js";

// Access token 15m, refresh token 7d, per constitution Principle III.
export interface AccessTokenPayload {
  sub: string;
  role: Role;
  employeeId: string | null;
}

export interface RefreshTokenPayload {
  sub: string;
  salt: string;
}

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function signAccessToken(payload: AccessTokenPayload, secret: string): string {
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TOKEN_TTL });
}

export function signRefreshToken(payload: { sub: string }, secret: string): string {
  const body: RefreshTokenPayload = { sub: payload.sub, salt: randomTokenSalt() };
  return jwt.sign(body, secret, { expiresIn: REFRESH_TOKEN_TTL });
}

export function verifyToken<T>(token: string, secret: string): T {
  return jwt.verify(token, secret) as T;
}

// Raw refresh token value stored client-side (cookie) only; the database only ever sees
// this hash (data-model.md § RefreshToken validation rules) so a DB read can't leak a
// usable session token.
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// A random opaque component mixed into the signed refresh JWT so two refresh tokens
// issued in the same second for the same user still hash to different values.
export function randomTokenSalt(): string {
  return randomBytes(16).toString("hex");
}

// 013: a short-lived token proving "password OK, second factor pending". Signed with a key
// derived from — but distinct from — the access secret, so it can never pass as an access token.
export interface MfaTokenPayload {
  sub: string;
  purpose: "mfa";
}

function mfaSecret(): string {
  const base = process.env.JWT_ACCESS_SECRET;
  if (!base) throw new Error("JWT_ACCESS_SECRET is not configured");
  return `${base}:mfa-challenge`;
}

export function signMfaToken(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "mfa" } satisfies MfaTokenPayload, mfaSecret(), { expiresIn: "5m" });
}

export function verifyMfaToken(token: string): MfaTokenPayload {
  const payload = jwt.verify(token, mfaSecret()) as MfaTokenPayload;
  if (payload.purpose !== "mfa") throw new Error("not an MFA token");
  return payload;
}
