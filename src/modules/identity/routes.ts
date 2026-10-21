import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./controller.js";
import {
  BreakGlassRequestSchema,
  ConfirmEnrollmentRequestSchema,
  EnrollmentStartSchema,
  MfaStatusSchema,
  MfaTokenRequestSchema,
  MfaVerifyRequestSchema,
  SettingsSchema,
  UpdateSettingsRequestSchema,
} from "./schema.js";

// Contract: specs/013-sso-mfa/contracts/identity-api.md.
// Public sign-in steps live under /api/auth (mounted after 001's auth router).
export const identityAuthRouter = Router();
// Authenticated settings and self-service under /api/identity.
export const identityRouter = Router();

// FR-011 (in addition to the per-account lock in service.ts): throttle the public steps by IP.
const signInStepLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

identityAuthRouter.post("/mfa/verify", signInStepLimiter, validate(MfaVerifyRequestSchema), handle(c.mfaVerify));
identityAuthRouter.post("/mfa/enroll", signInStepLimiter, validate(MfaTokenRequestSchema), handle(c.mfaChallengeEnrollStart));
identityAuthRouter.post("/mfa/enroll/confirm", signInStepLimiter, validate(MfaVerifyRequestSchema), handle(c.mfaChallengeEnrollConfirm));
identityAuthRouter.get("/sso/start", signInStepLimiter, handle(c.ssoStart));
identityAuthRouter.get("/sso/callback", signInStepLimiter, handle(c.ssoCallback));

identityRouter.use(authenticate);
const HR = authorize("ADMIN", "HR");
identityRouter.get("/mfa/me", handle(c.myMfa));
identityRouter.post("/mfa/enroll", handle(c.myEnrollStart));
identityRouter.post("/mfa/enroll/confirm", validate(ConfirmEnrollmentRequestSchema), handle(c.myEnrollConfirm));
identityRouter.delete("/mfa/users/:userId", HR, handle(c.resetMfa));
identityRouter.get("/settings", HR, handle(c.getSettings));
identityRouter.put("/settings", HR, validate(UpdateSettingsRequestSchema), handle(c.updateSettings));
identityRouter.put("/break-glass/:userId", authorize("ADMIN"), validate(BreakGlassRequestSchema), handle(c.setBreakGlass));

const TAG = "SSO & MFA";
const session = z.object({ accessToken: z.string(), user: z.object({ id: z.string(), email: z.string(), role: z.string(), employeeId: z.string().nullable() }) });
const user = z.object({ userId: z.string() });
documentRoute({ method: "post", path: "/auth/mfa/verify", tag: TAG, auth: false, status: 200, description: "Second sign-in step: the mfaToken from POST /auth/login plus a 6-digit code; returns a session. 5 bad codes lock MFA for 15 minutes.", body: MfaVerifyRequestSchema, response: session });
documentRoute({ method: "post", path: "/auth/mfa/enroll", tag: TAG, auth: false, status: 200, description: "When login says enrollmentRequired: start MFA setup with the mfaToken.", body: MfaTokenRequestSchema, response: EnrollmentStartSchema });
documentRoute({ method: "post", path: "/auth/mfa/enroll/confirm", tag: TAG, auth: false, status: 200, description: "Confirm setup with a code from the new authenticator; returns a session.", body: MfaVerifyRequestSchema, response: session });
documentRoute({ method: "get", path: "/auth/sso/start", tag: TAG, auth: false, status: 302, description: "Redirect to the configured Google/Microsoft sign-in (?redirect=false returns {url}).", query: z.object({ redirect: z.enum(["false"]).optional() }) });
documentRoute({ method: "get", path: "/auth/sso/callback", tag: TAG, auth: false, status: 302, description: "Identity-provider callback: signs in a matching employee and redirects to PUBLIC_APP_URL/sso/complete (or /login?ssoError=CODE)." });
documentRoute({ method: "get", path: "/identity/mfa/me", tag: TAG, description: "Your MFA status.", response: MfaStatusSchema });
documentRoute({ method: "post", path: "/identity/mfa/enroll", tag: TAG, status: 200, description: "Start setting up an authenticator app.", response: EnrollmentStartSchema });
documentRoute({ method: "post", path: "/identity/mfa/enroll/confirm", tag: TAG, status: 200, description: "Confirm setup with a code.", body: ConfirmEnrollmentRequestSchema, response: MfaStatusSchema });
documentRoute({ method: "delete", path: "/identity/mfa/users/{userId}", tag: TAG, status: 204, description: "Reset a user's MFA (lost device). Admin/HR.", params: user });
documentRoute({ method: "get", path: "/identity/settings", tag: TAG, description: "SSO provider, enforcement, MFA requirement and break-glass accounts. Admin/HR.", response: SettingsSchema });
documentRoute({ method: "put", path: "/identity/settings", tag: TAG, description: "Configure provider / enforce SSO / require MFA. Enforcing needs a usable break-glass Admin. Admin/HR.", body: UpdateSettingsRequestSchema, response: SettingsSchema });
documentRoute({ method: "put", path: "/identity/break-glass/{userId}", tag: TAG, description: "Grant/revoke break-glass on an Admin account. Admin only.", params: user, body: BreakGlassRequestSchema, response: SettingsSchema });
