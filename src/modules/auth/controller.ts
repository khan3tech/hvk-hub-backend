// Parses/validates the request (via schema.ts + the validate middleware),
// calls one or more services, and shapes the HTTP response. No business
// logic here — see specs/001-auth-rbac/spec.md for what this module must do.
import type { Request, Response } from "express";
import { DomainError } from "../../middleware/errorHandler.js";
import * as authService from "./service.js";
import { orgOf } from "../../lib/tenant.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";

const REFRESH_COOKIE = "refreshToken";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  // "strict" in production, where a reverse proxy puts apps/web and apps/api on the same
  // origin (constitution's deployment model). In local dev the two run on different ports
  // (localhost:3000 / :4000), which browsers treat as cross-origin — a Strict cookie is never
  // reliably sent on that cross-origin fetch, so the browser ends up with no session cookie at
  // all after login and middleware.ts bounces every page back to /login. "lax" still blocks the
  // cookie on genuine cross-site requests from other sites; it just tolerates this same-machine,
  // different-port dev setup.
  sameSite: (IS_PRODUCTION ? "strict" : "lax") as "strict" | "lax",
  path: "/api/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// Shared with 013's MFA and SSO completion endpoints.
export function setSessionCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTIONS);
}

export async function login(req: Request, res: Response): Promise<void> {
  // 015: the organization is resolved from the email (+ optional organization slug).
  const result = await authService.login(req.body);
  if ("mfaRequired" in result) {
    // 013: second step pending — no session cookie yet.
    res.json(result);
    return;
  }

  setSessionCookie(res, result.refreshToken);
  res.json({ accessToken: result.accessToken, user: result.user });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!raw) {
    throw new DomainError("INVALID_SESSION", "Session expired. Please sign in again.", 401);
  }

  const result = await authService.refresh(raw);
  res.cookie(REFRESH_COOKIE, result.refreshToken, REFRESH_COOKIE_OPTIONS);
  res.json({ accessToken: result.accessToken });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  await authService.logout(raw);
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  const orgId = orgOf(req);
  const payload = req.user as AccessTokenPayload;
  const user = await authService.getUserById(orgId, payload.sub);
  if (!user) {
    throw new DomainError("UNAUTHENTICATED", "Sign-in required.", 401);
  }
  res.json({ id: user.id, email: user.email, role: user.role, employeeId: user.employeeId });
}

export async function unlock(req: Request, res: Response): Promise<void> {
  const orgId = orgOf(req);
  const actor = req.user as AccessTokenPayload;
  const { userId } = req.params;
  if (!userId) {
    throw new DomainError("NOT_FOUND", "User not found.", 404);
  }
  const result = await authService.unlockUser(orgId, userId, actor);
  res.json(result);
}
