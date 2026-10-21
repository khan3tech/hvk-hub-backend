import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { documentRoute, registry } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./controller.js";
import { uploadFile } from "../../middleware/upload.js";
import {
  CreateSignatureRequestSchema,
  CreatedSignatureRequestSchema,
  DocumentSchema,
  PolicySchema,
  PolicyStatusSchema,
  PublishPolicyFieldsSchema,
  SignRequestSchema,
  SignatureRequestSchema,
  UploadDocumentFieldsSchema,
} from "./schema.js";

// Contract: specs/008-document-esignature/contracts/documents-api.md. Owner/manager visibility
// (FR-003, SC-005) and signer identity (FR-006) are enforced in service.ts.
export const documentsRouter = Router();
export const policiesRouter = Router();
// Candidates have no login: they reach their own request only through its secret link token.
export const publicSignaturesRouter = Router();

const HR = authorize("ADMIN", "HR");
const TAG = "Documents & e-Signature";

documentsRouter.post("/employees/:employeeId", authenticate, HR, uploadFile(true), validate(UploadDocumentFieldsSchema), handle(c.uploadEmployeeDocument));
documentsRouter.get("/employees/:employeeId", authenticate, handle(c.listEmployeeDocuments));
documentsRouter.post("/candidates/:candidateId", authenticate, HR, uploadFile(true), validate(UploadDocumentFieldsSchema), handle(c.uploadCandidateDocument));
documentsRouter.get("/candidates/:candidateId", authenticate, HR, handle(c.listCandidateDocuments));
documentsRouter.get("/signatures", authenticate, handle(c.listSignatureRequests));
documentsRouter.get("/signatures/:id", authenticate, handle(c.getSignatureRequest));
documentsRouter.post("/signatures/:id/sign", authenticate, validate(SignRequestSchema), handle(c.signAsEmployee));
documentsRouter.get("/:id/download", authenticate, handle(c.downloadDocument));
documentsRouter.post("/:id/signature-requests", authenticate, HR, validate(CreateSignatureRequestSchema), handle(c.requestSignature));

policiesRouter.post("/", authenticate, HR, uploadFile(false), validate(PublishPolicyFieldsSchema), handle(c.publishPolicy));
policiesRouter.get("/", authenticate, handle(c.listPolicies));
policiesRouter.post("/:id/acknowledge", authenticate, handle(c.acknowledgePolicy));
policiesRouter.get("/:id/status", authenticate, HR, handle(c.policyStatus));

const tokenLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
publicSignaturesRouter.use(tokenLimiter);
publicSignaturesRouter.get("/:token", handle(c.getByToken));
publicSignaturesRouter.get("/:token/download", handle(c.downloadByToken));
publicSignaturesRouter.post("/:token/sign", validate(SignRequestSchema), handle(c.signByToken));

const multipart = (fields: z.AnyZodObject) =>
  ({ content: { "multipart/form-data": { schema: fields.extend({ file: z.string().openapi({ type: "string", format: "binary" }) }) } } }) as const;
const emp = z.object({ employeeId: z.string() });
const cand = z.object({ candidateId: z.string() });
const id = z.object({ id: z.string() });
const token = z.object({ token: z.string() });
const bearer = [{ bearerAuth: [] }];

registry.registerPath({ method: "post", path: "/documents/employees/{employeeId}", tags: [TAG], security: bearer, description: "Upload a labeled document for an employee (PDF/PNG/JPEG/DOCX, size-limited). Same label = new version. Admin/HR.", request: { params: emp, body: multipart(UploadDocumentFieldsSchema) }, responses: { 201: { description: "Stored.", content: { "application/json": { schema: DocumentSchema } } } } });
registry.registerPath({ method: "post", path: "/documents/candidates/{candidateId}", tags: [TAG], security: bearer, description: "Upload a labeled document for a candidate. Admin/HR.", request: { params: cand, body: multipart(UploadDocumentFieldsSchema) }, responses: { 201: { description: "Stored.", content: { "application/json": { schema: DocumentSchema } } } } });
registry.registerPath({ method: "post", path: "/policies", tags: [TAG], security: bearer, description: "Publish a policy (optional file) every active employee must acknowledge. Admin/HR.", request: { body: multipart(PublishPolicyFieldsSchema) }, responses: { 201: { description: "Published.", content: { "application/json": { schema: PolicySchema } } } } });

documentRoute({ method: "get", path: "/documents/employees/{employeeId}", tag: TAG, description: "An employee's documents (current versions; ?history=true for all). Owner and HR/Admin; their Manager sees manager-visible ones only.", params: emp, query: z.object({ history: z.enum(["true", "false"]).optional() }), response: z.array(DocumentSchema) });
documentRoute({ method: "get", path: "/documents/candidates/{candidateId}", tag: TAG, description: "A candidate's documents. Admin/HR.", params: cand, response: z.array(DocumentSchema) });
documentRoute({ method: "get", path: "/documents/{id}/download", tag: TAG, description: "Download a document's file (same access rules as listing).", params: id });
documentRoute({ method: "post", path: "/documents/{id}/signature-requests", tag: TAG, description: "Send the current version for signature to its employee or candidate. Candidates get a private link (returned once and emailed). Admin/HR.", params: id, body: CreateSignatureRequestSchema, response: CreatedSignatureRequestSchema });
documentRoute({ method: "get", path: "/documents/signatures", tag: TAG, description: "Signature requests: all for Admin/HR (filter status, applicationId), otherwise those sent to the caller.", query: z.object({ status: z.enum(["AWAITING", "SIGNED"]).optional(), applicationId: z.string().optional() }), response: z.array(SignatureRequestSchema) });
documentRoute({ method: "get", path: "/documents/signatures/{id}", tag: TAG, description: "One signature request with its document (sender side or the recipient).", params: id, response: SignatureRequestSchema });
documentRoute({ method: "post", path: "/documents/signatures/{id}/sign", tag: TAG, status: 200, description: "Sign as the designated employee recipient; first signature wins, then immutable.", params: id, body: SignRequestSchema, response: SignatureRequestSchema });
documentRoute({ method: "get", path: "/policies", tag: TAG, description: "Published policies with the caller's acknowledgment time.", response: z.array(PolicySchema) });
documentRoute({ method: "post", path: "/policies/{id}/acknowledge", tag: TAG, status: 200, description: "Acknowledge a policy (idempotent).", params: id });
documentRoute({ method: "get", path: "/policies/{id}/status", tag: TAG, description: "Acknowledged vs pending across current active employees. Admin/HR.", params: id, response: PolicyStatusSchema });
documentRoute({ method: "get", path: "/public/signatures/{token}", tag: TAG, auth: false, description: "Candidate signing link: the request and document metadata.", params: token, response: SignatureRequestSchema });
documentRoute({ method: "get", path: "/public/signatures/{token}/download", tag: TAG, auth: false, description: "Candidate signing link: download the document.", params: token });
documentRoute({ method: "post", path: "/public/signatures/{token}/sign", tag: TAG, auth: false, status: 200, description: "Candidate signing link: sign with full name.", params: token, body: SignRequestSchema, response: SignatureRequestSchema });
