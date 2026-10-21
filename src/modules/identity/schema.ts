import { z } from "zod";

// Request/response validation for SSO and MFA (specs/013-sso-mfa).
export const ProviderSchema = z.enum(["GOOGLE", "MICROSOFT"]);
export type Provider = z.infer<typeof ProviderSchema>;

export const UpdateSettingsRequestSchema = z
  .object({
    provider: ProviderSchema.nullable().optional(),
    enforced: z.boolean().optional(),
    mfaRequired: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export const SettingsSchema = z.object({
  provider: ProviderSchema.nullable(),
  providerCredentialsConfigured: z.boolean(),
  enforced: z.boolean(),
  mfaRequired: z.boolean(),
  breakGlassAccounts: z.array(z.object({ userId: z.string(), email: z.string() })),
});

export const BreakGlassRequestSchema = z.object({ enabled: z.boolean() });

export const CodeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app.");
export const MfaTokenRequestSchema = z.object({ mfaToken: z.string().min(10) });
export const MfaVerifyRequestSchema = z.object({ mfaToken: z.string().min(10), code: CodeSchema });
export const ConfirmEnrollmentRequestSchema = z.object({ code: CodeSchema });

export const EnrollmentStartSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
});

export const MfaStatusSchema = z.object({
  enrolled: z.boolean(),
  pending: z.boolean(),
  required: z.boolean(),
});
