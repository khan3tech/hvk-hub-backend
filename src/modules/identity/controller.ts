// Parses the request, calls the service, shapes the response (specs/013-sso-mfa).
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { DomainError } from "../../middleware/errorHandler.js";
import { logger } from "../../lib/logger.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import { setSessionCookie } from "../auth/controller.js";
import { getUserById, resolveOrganizationSlug } from "../auth/service.js";
import { DEFAULT_ORG_ID, orgOf } from "../../lib/tenant.js";
import * as service from "./service.js";
import type { Provider } from "./schema.js";

const orgId = (req: Request) => orgOf(req);
const actorOf = (req: Request) => req.user as AccessTokenPayload;

// --- Second step of password sign-in (public; the mfaToken is the credential) ---

function sendSession(res: Response, session: { accessToken: string; refreshToken: string; user: unknown }) {
  setSessionCookie(res, session.refreshToken);
  res.json({ accessToken: session.accessToken, user: session.user });
}

export async function mfaVerify(req: Request, res: Response) {
  sendSession(res, await service.completeMfaSignIn(req.body.mfaToken, req.body.code));
}
export async function mfaChallengeEnrollStart(req: Request, res: Response) {
  res.json(await service.startEnrollmentFromChallenge(req.body.mfaToken));
}
export async function mfaChallengeEnrollConfirm(req: Request, res: Response) {
  sendSession(res, await service.confirmEnrollmentFromChallenge(req.body.mfaToken, req.body.code));
}

// --- SSO browser round-trip (public) ---

const FLOW_COOKIE = "sso_flow";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const flowCookieOptions = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : IS_PRODUCTION,
  // The callback is a top-level redirect back from the identity provider: Lax is sent, Strict isn't.
  sameSite: "lax" as const,
  path: "/api/auth/sso",
  maxAge: 10 * 60 * 1000,
};
const flowSecret = () => `${process.env.JWT_ACCESS_SECRET ?? ""}:sso-flow`;
const appUrl = () => (process.env.PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function ssoStart(req: Request, res: Response) {
  // 015: which organization's identity provider — ?organization=<slug> (default org if omitted).
  const slug = typeof req.query.organization === "string" ? req.query.organization : null;
  const ssoOrg = slug ? await resolveOrganizationSlug(slug) : DEFAULT_ORG_ID;
  if (!ssoOrg) throw new DomainError("SSO_NOT_CONFIGURED", "Unknown organization.", 404);
  const { url, flow } = await service.startSso(ssoOrg);
  res.cookie(FLOW_COOKIE, jwt.sign(flow, flowSecret(), { expiresIn: "10m" }), flowCookieOptions);
  if (req.query.redirect === "false") {
    res.json({ url });
    return;
  }
  res.redirect(302, url);
}

export async function ssoCallback(req: Request, res: Response) {
  res.clearCookie(FLOW_COOKIE, { path: flowCookieOptions.path });
  try {
    const raw = req.cookies?.[FLOW_COOKIE] as string | undefined;
    if (!raw) throw new DomainError("SSO_STATE_MISMATCH", "This sign-in link expired. Please try again.", 400);
    let flow: { orgId: string; provider: Provider; state: string; nonce: string; codeVerifier: string };
    try {
      flow = jwt.verify(raw, flowSecret()) as typeof flow;
    } catch {
      throw new DomainError("SSO_STATE_MISMATCH", "This sign-in link expired. Please try again.", 400);
    }
    const session = await service.finishSso(flow.orgId, flow, {
      code: typeof req.query.code === "string" ? req.query.code : undefined,
      state: typeof req.query.state === "string" ? req.query.state : undefined,
    });
    setSessionCookie(res, session.refreshToken);
    // The app picks up its access token with POST /auth/refresh (cookie already set).
    res.redirect(302, `${appUrl()}/sso/complete`);
  } catch (err) {
    const code = err instanceof DomainError ? err.code : "SSO_FAILED";
    if (!(err instanceof DomainError)) logger.error({ err }, "SSO callback failed");
    res.redirect(302, `${appUrl()}/login?ssoError=${encodeURIComponent(code)}`);
  }
}

// --- Authenticated self-service MFA ---

export async function myMfa(req: Request, res: Response) {
  res.json(await service.mfaStatus(orgId(req), actorOf(req).sub));
}
export async function myEnrollStart(req: Request, res: Response) {
  const me = await getUserById(orgId(req), actorOf(req).sub);
  if (!me) throw new DomainError("NOT_FOUND", "User not found.", 404);
  res.json(await service.startEnrollment(orgId(req), me.id, me.email));
}
export async function myEnrollConfirm(req: Request, res: Response) {
  const actor = actorOf(req);
  await service.confirmEnrollment(orgId(req), actor.sub, req.body.code, actor);
  res.json(await service.mfaStatus(orgId(req), actor.sub));
}

// --- HR/Admin ---

export async function getSettings(req: Request, res: Response) {
  res.json(await service.getSettings(orgId(req)));
}
export async function updateSettings(req: Request, res: Response) {
  res.json(await service.updateSettings(orgId(req), req.body, actorOf(req)));
}
export async function setBreakGlass(req: Request, res: Response) {
  res.json(await service.setBreakGlassAccount(orgId(req), req.params.userId ?? "", req.body.enabled, actorOf(req)));
}
export async function resetMfa(req: Request, res: Response) {
  await service.resetMfa(orgId(req), req.params.userId ?? "", actorOf(req));
  res.status(204).send();
}
