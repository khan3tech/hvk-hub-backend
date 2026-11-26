import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { registry, bearerAuth } from "../../lib/openapi.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./controller.js";
import {
  ChangePasswordRequestSchema,
  ResetPasswordResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  RefreshResponseSchema,
  AuthUserSchema,
  UnlockResponseSchema,
} from "./schema.js";

// Declares this module's endpoints, attaches auth + RBAC middleware, and
// delegates to controller.ts. See specs/001-auth-rbac/spec.md and
// contracts/auth-api.md for requirements.
export const authRouter = Router();

// Scoped to POST /auth/login only (not blanket across /auth/*) — refresh/logout aren't
// credential-guessing targets (research.md R3). Keyed by email + IP via the request body.
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email ?? "")}`,
});

authRouter.post("/login", loginRateLimiter, validate(LoginRequestSchema), (req, res, next) => {
  controller.login(req, res).catch(next);
});

authRouter.post("/refresh", (req, res, next) => {
  controller.refresh(req, res).catch(next);
});

authRouter.post("/logout", authenticate, (req, res, next) => {
  controller.logout(req, res).catch(next);
});

authRouter.get("/me", authenticate, (req, res, next) => {
  controller.me(req, res).catch(next);
});

// The signed-in user sets a new password (required after a temporary one).
authRouter.post("/change-password", authenticate, validate(ChangePasswordRequestSchema), (req, res, next) => {
  controller.changePassword(req, res).catch(next);
});

// HR/Admin issue a new temporary password for an employee (must be changed at next sign-in).
authRouter.post("/employees/:employeeId/reset-password", authenticate, authorize("ADMIN", "HR"), (req, res, next) => {
  controller.resetPassword(req, res).catch(next);
});

authRouter.post("/:userId/unlock", authenticate, authorize("ADMIN", "HR"), (req, res, next) => {
  controller.unlock(req, res).catch(next);
});

registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags: ["Auth"],
  description: "Sign in with email and password.",
  request: { body: { content: { "application/json": { schema: LoginRequestSchema } } } },
  responses: { 200: { description: "Signed in.", content: { "application/json": { schema: LoginResponseSchema } } } },
});

registry.registerPath({
  method: "post",
  path: "/auth/refresh",
  tags: ["Auth"],
  description: "Exchange a valid refresh cookie for a new access token.",
  responses: {
    200: { description: "Refreshed.", content: { "application/json": { schema: RefreshResponseSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/logout",
  tags: ["Auth"],
  description: "Sign out, immediately invalidating the current session.",
  security: [{ [bearerAuth.name]: [] }],
  responses: { 204: { description: "Signed out." } },
});

registry.registerPath({
  method: "get",
  path: "/auth/me",
  tags: ["Auth"],
  description: "Get the current signed-in user.",
  security: [{ [bearerAuth.name]: [] }],
  responses: { 200: { description: "Current user.", content: { "application/json": { schema: AuthUserSchema } } } },
});

registry.registerPath({
  method: "post",
  path: "/auth/{userId}/unlock",
  tags: ["Auth"],
  description: "Unlock a locked account. Admin/HR only.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ userId: z.string() }) },
  responses: {
    200: { description: "Unlocked.", content: { "application/json": { schema: UnlockResponseSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/change-password",
  tags: ["Auth"],
  description:
    "Change your own password (8+ characters, a letter and a number, different from the current one). Required after a temporary password: until then other endpoints answer 403 PASSWORD_CHANGE_REQUIRED. Ends other sessions and returns a fresh one.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: ChangePasswordRequestSchema } } } },
  responses: {
    200: { description: "Password changed; new session.", content: { "application/json": { schema: LoginResponseSchema } } },
    400: { description: "WRONG_PASSWORD, WEAK_PASSWORD or SAME_PASSWORD." },
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/employees/{employeeId}/reset-password",
  tags: ["Auth"],
  description: "Admin/HR: issue a new temporary password for an employee (shown once). It must be changed at next sign-in; the account is unlocked and all its sessions end. Only an Admin can reset an Admin.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ employeeId: z.string() }) },
  responses: { 200: { description: "Temporary password.", content: { "application/json": { schema: ResetPasswordResponseSchema } } } },
});
