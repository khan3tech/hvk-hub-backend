import { z } from "zod";

// Request/response validation for the platform (super-admin) tier (specs/015-multi-tenant-activation).
export const PlatformLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const CreateOrganizationRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  // Lowercase handle used at sign-in when an email exists in more than one organization.
  slug: z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, "3-40 chars: lowercase letters, digits, hyphens."),
  adminName: z.string().trim().min(1).max(120),
  adminEmail: z.string().email(),
});
export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequestSchema>;

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  createdAt: z.string().datetime(),
  suspendedAt: z.string().datetime().nullable(),
  usage: z.object({
    activeEmployees: z.number().int(),
    users: z.number().int(),
    lastActivityAt: z.string().datetime().nullable(),
  }),
});

export const ProvisionedOrganizationSchema = z.object({
  organization: OrganizationSchema.omit({ usage: true }),
  admin: z.object({ employeeId: z.string(), email: z.string(), temporaryPassword: z.string() }),
});
