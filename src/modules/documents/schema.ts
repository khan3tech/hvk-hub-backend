import { z } from "zod";

// Request/response validation for documents, e-signature and policies
// (specs/008-document-esignature). Multipart text fields arrive as strings.
const boolString = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => v === "true");

export const UploadDocumentFieldsSchema = z.object({
  label: z.string().trim().min(1).max(120),
  managerVisible: boolString,
});
export type UploadDocumentFields = z.infer<typeof UploadDocumentFieldsSchema>;

export const DocumentSchema = z.object({
  id: z.string(),
  ownerType: z.enum(["EMPLOYEE", "CANDIDATE", "ORGANIZATION"]),
  employeeId: z.string().nullable(),
  candidateId: z.string().nullable(),
  label: z.string(),
  version: z.number().int(),
  isCurrent: z.boolean(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  originalName: z.string().nullable(),
  managerVisible: z.boolean(),
  uploadedAt: z.string().datetime(),
});

export const CreateSignatureRequestSchema = z
  .object({
    recipientEmployeeId: z.string().optional(),
    recipientCandidateId: z.string().optional(),
    applicationId: z.string().optional(),
  })
  .refine((v) => Boolean(v.recipientEmployeeId) !== Boolean(v.recipientCandidateId), {
    message: "Provide exactly one of recipientEmployeeId or recipientCandidateId.",
  });
export type CreateSignatureRequest = z.infer<typeof CreateSignatureRequestSchema>;

export const SignRequestSchema = z.object({
  // Typed full name = the signature (Assumptions: click-to-sign with an audit trail).
  fullName: z.string().trim().min(2).max(120),
});

export const SignatureRequestSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  recipientType: z.enum(["EMPLOYEE", "CANDIDATE", "ORGANIZATION"]),
  recipientEmployeeId: z.string().nullable(),
  recipientCandidateId: z.string().nullable(),
  applicationId: z.string().nullable(),
  status: z.enum(["AWAITING", "SIGNED"]),
  actionable: z.boolean(),
  signedAt: z.string().datetime().nullable(),
  signedByName: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const CreatedSignatureRequestSchema = SignatureRequestSchema.extend({
  // Candidates only, returned once: the private signing link (also emailed).
  signingUrl: z.string().url().optional(),
});

export const PublishPolicyFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export const PolicySchema = z.object({
  id: z.string(),
  title: z.string(),
  documentId: z.string().nullable(),
  publishedAt: z.string().datetime(),
  myAcknowledgedAt: z.string().datetime().nullable().optional(),
});

export const PolicyStatusSchema = z.object({
  policyId: z.string(),
  acknowledgedCount: z.number().int(),
  pendingCount: z.number().int(),
  acknowledged: z.array(z.object({ employeeId: z.string(), name: z.string(), acknowledgedAt: z.string().datetime() })),
  pending: z.array(z.object({ employeeId: z.string(), name: z.string() })),
});
