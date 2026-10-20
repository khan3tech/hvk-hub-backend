import { z } from "zod";
import { ROLES } from "../../lib/roles.js";

// Request/response validation for the auth module.
// See specs/001-auth-rbac/spec.md for the functional requirements.
export const RoleSchema = z.enum(ROLES);

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: RoleSchema,
  employeeId: z.string().nullable(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  user: AuthUserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const UnlockResponseSchema = z.object({
  id: z.string(),
  lockedAt: z.null(),
});
export type UnlockResponse = z.infer<typeof UnlockResponseSchema>;
