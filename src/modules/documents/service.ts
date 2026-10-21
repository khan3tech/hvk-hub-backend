// Business rules for documents, e-signature and policy acknowledgments.
// Framework-agnostic — no req/res. Implements specs/008-document-esignature/spec.md.
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { DomainError } from "../../middleware/errorHandler.js";
import { getStorage } from "../../lib/storage.js";
import { getEmailSender } from "../../lib/email.js";
import { logger } from "../../lib/logger.js";
import { getEmployeeSummary, listActiveEmployeeSummaries } from "../employee/service.js";
import { getApplicationSummary, getCandidate } from "../recruitment/service.js";
import { notifyEmployees } from "../notifications/service.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import type { CreateSignatureRequest, UploadDocumentFields } from "./schema.js";

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

type Doc = NonNullable<Awaited<ReturnType<typeof repo.findDocument>>>;
type SigRequest = NonNullable<Awaited<ReturnType<typeof repo.findSignatureRequest>>>;

const isPrivileged = (actor: AccessTokenPayload) => actor.role === "HR" || actor.role === "ADMIN";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function audit(orgId: string, actor: AccessTokenPayload | null, action: string, entity: string, entityId: string, after?: unknown) {
  if (!actor?.employeeId) return;
  await repo.writeActivityLog({ orgId, actorId: actor.employeeId, action, entity, entityId, after });
}

function publicDocument(doc: Doc) {
  // fileUrl is an internal storage key — never returned.
  const { fileUrl: _key, ...rest } = doc;
  return rest;
}

// --- Access (FR-002, FR-003, SC-005) ---

async function canReadEmployeeDocs(orgId: string, employeeId: string, actor: AccessTokenPayload) {
  const owner = await getEmployeeSummary(orgId, employeeId);
  // 015 FR-003: an employee of another organization doesn't exist from here.
  if (!owner) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  if (isPrivileged(actor) || actor.employeeId === employeeId) return { all: true };
  if (owner && actor.role === "MANAGER" && owner.managerId === actor.employeeId) {
    return { all: false }; // manager-visible documents only
  }
  return null;
}

async function assertCanRead(orgId: string, doc: Doc, actor: AccessTokenPayload) {
  if (isPrivileged(actor)) return;
  if (doc.ownerType === "EMPLOYEE" && doc.employeeId) {
    const access = await canReadEmployeeDocs(orgId, doc.employeeId, actor);
    if (access && (access.all || doc.managerVisible)) return;
  }
  // Anyone signed in may read a published policy's file; an employee may read a document
  // they've been asked to sign.
  if (doc.ownerType === "ORGANIZATION" && (await repo.isPolicyDocument(orgId, doc.id))) return;
  if (actor.employeeId) {
    const asked = await repo.listSignatureRequests(orgId, { documentId: doc.id, recipientEmployeeId: actor.employeeId });
    if (asked.length > 0) return;
  }
  throw new DomainError("FORBIDDEN", "You don't have access to this document.", 403);
}

// --- Documents (US1) ---

async function store(file: UploadedFile, prefix: string) {
  return getStorage().put(file.buffer, { contentType: file.mimetype, prefix });
}

export async function uploadEmployeeDocument(orgId: string, employeeId: string, fields: UploadDocumentFields, file: UploadedFile, actor: AccessTokenPayload) {
  if (!(await getEmployeeSummary(orgId, employeeId))) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  const key = await store(file, `documents/employees/${employeeId}`);
  const doc = await repo.createDocumentVersion(orgId, { ownerType: "EMPLOYEE", employeeId }, {
    label: fields.label,
    fileUrl: key,
    contentType: file.mimetype,
    sizeBytes: file.size,
    originalName: file.originalname.slice(0, 200),
    uploadedById: actor.employeeId,
    managerVisible: fields.managerVisible,
  });
  await audit(orgId, actor, "document.uploaded", "Document", doc.id, { label: doc.label, version: doc.version, employeeId });
  return publicDocument(doc);
}

export async function uploadCandidateDocument(orgId: string, candidateId: string, fields: UploadDocumentFields, file: UploadedFile, actor: AccessTokenPayload) {
  await getCandidate(orgId, candidateId); // 404 if missing
  const key = await store(file, `documents/candidates/${candidateId}`);
  const doc = await repo.createDocumentVersion(orgId, { ownerType: "CANDIDATE", candidateId }, {
    label: fields.label,
    fileUrl: key,
    contentType: file.mimetype,
    sizeBytes: file.size,
    originalName: file.originalname.slice(0, 200),
    uploadedById: actor.employeeId,
  });
  await audit(orgId, actor, "document.uploaded", "Document", doc.id, { label: doc.label, version: doc.version, candidateId });
  return publicDocument(doc);
}

export async function listEmployeeDocuments(orgId: string, employeeId: string, actor: AccessTokenPayload, history = false) {
  const access = await canReadEmployeeDocs(orgId, employeeId, actor);
  if (!access) throw new DomainError("FORBIDDEN", "You don't have access to these documents.", 403);
  const docs = await repo.listDocuments(orgId, { ownerType: "EMPLOYEE", employeeId }, { history, managerVisibleOnly: !access.all });
  return docs.map(publicDocument);
}

export async function listCandidateDocuments(orgId: string, candidateId: string, history = false) {
  await getCandidate(orgId, candidateId);
  const docs = await repo.listDocuments(orgId, { ownerType: "CANDIDATE", candidateId }, { history });
  return docs.map(publicDocument);
}

export async function openDocument(orgId: string, id: string, actor: AccessTokenPayload) {
  const doc = await repo.findDocument(orgId, id);
  if (!doc) throw new DomainError("NOT_FOUND", "Document not found.", 404);
  await assertCanRead(orgId, doc, actor);
  return { doc: publicDocument(doc), stream: await getStorage().open(doc.fileUrl) };
}

// --- Signature requests (US2) ---

async function isActionable(orgId: string, request: { status: string; recipientType: string; recipientEmployeeId: string | null; applicationId: string | null }) {
  if (request.status !== "AWAITING") return false;
  if (request.recipientType === "EMPLOYEE" && request.recipientEmployeeId) {
    const employee = await getEmployeeSummary(orgId, request.recipientEmployeeId);
    return employee?.status === "ACTIVE";
  }
  if (request.applicationId) {
    const application = await getApplicationSummary(orgId, request.applicationId);
    return Boolean(application) && application!.stage !== "REJECTED";
  }
  return true;
}

async function present(orgId: string, request: Omit<SigRequest, "document"> & { document?: unknown }) {
  const { accessTokenHash: _hash, document: _doc, ...rest } = request;
  return { ...rest, actionable: await isActionable(orgId, request) };
}

function signingUrl(token: string) {
  const base = (process.env.PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/sign/${token}`;
}

export async function requestSignature(orgId: string, documentId: string, input: CreateSignatureRequest, actor: AccessTokenPayload) {
  const doc = await repo.findDocument(orgId, documentId);
  if (!doc) throw new DomainError("NOT_FOUND", "Document not found.", 404);
  if (!doc.isCurrent) {
    throw new DomainError("NOT_CURRENT_VERSION", "Send the current version of this document.", 409);
  }

  if (input.recipientEmployeeId) {
    if (doc.ownerType === "CANDIDATE" || (doc.ownerType === "EMPLOYEE" && doc.employeeId !== input.recipientEmployeeId)) {
      throw new DomainError("RECIPIENT_MISMATCH", "This document belongs to someone else.", 409);
    }
    const employee = await getEmployeeSummary(orgId, input.recipientEmployeeId);
    if (!employee || employee.status !== "ACTIVE") {
      throw new DomainError("RECIPIENT_INACTIVE", "The recipient is not an active employee.", 409);
    }
    const request = await repo.createSignatureRequest({
      orgId,
      documentId,
      recipientType: "EMPLOYEE",
      recipientEmployeeId: employee.id,
      sentById: actor.employeeId,
    });
    await audit(orgId, actor, "signature.requested", "SignatureRequest", request.id, { documentId, recipientEmployeeId: employee.id });
    await notifyEmployees(orgId, [employee.id], {
      type: "SIGNATURE_REQUESTED",
      message: `Please review and sign "${doc.label}".`,
      link: `/documents/signatures/${request.id}`,
      email: { subject: `Signature requested: ${doc.label}`, text: `Please review and sign "${doc.label}" in TeamLoom.` },
    });
    return present(orgId, request);
  }

  // Candidate recipient: they have no login, so they sign through a private single-use link.
  const candidate = await getCandidate(orgId, input.recipientCandidateId!);
  if (doc.ownerType === "EMPLOYEE" || (doc.ownerType === "CANDIDATE" && doc.candidateId !== candidate.id)) {
    throw new DomainError("RECIPIENT_MISMATCH", "This document belongs to someone else.", 409);
  }
  if (input.applicationId) {
    const application = await getApplicationSummary(orgId, input.applicationId);
    if (!application || application.candidateId !== candidate.id) {
      throw new DomainError("VALIDATION_ERROR", "That application isn't this candidate's.", 400, { applicationId: ["Mismatch."] });
    }
  }
  const token = randomBytes(32).toString("base64url");
  const request = await repo.createSignatureRequest({
    orgId,
    documentId,
    recipientType: "CANDIDATE",
    recipientCandidateId: candidate.id,
    applicationId: input.applicationId ?? null,
    sentById: actor.employeeId,
    accessTokenHash: hashToken(token),
  });
  await audit(orgId, actor, "signature.requested", "SignatureRequest", request.id, { documentId, recipientCandidateId: candidate.id });
  const url = signingUrl(token);
  try {
    await getEmailSender().send({
      to: candidate.email,
      subject: `Please sign: ${doc.label}`,
      text: `Hello ${candidate.name}, please review and sign "${doc.label}": ${url}`,
    });
  } catch (err) {
    logger.warn({ err, requestId: request.id }, "signature link email failed");
  }
  return { ...(await present(orgId, request)), signingUrl: url };
}

// FR-008: the sender side (HR/Admin) sees everything; others see what was sent to them.
export async function listSignatureRequests(orgId: string, actor: AccessTokenPayload, filters: { status?: string; applicationId?: string }) {
  const where: Prisma.SignatureRequestWhereInput = {};
  if (filters.status === "AWAITING" || filters.status === "SIGNED") where.status = filters.status;
  if (filters.applicationId) where.applicationId = filters.applicationId;
  if (!isPrivileged(actor)) where.recipientEmployeeId = actor.employeeId ?? "__none__";
  const requests = await repo.listSignatureRequests(orgId, where);
  return Promise.all(requests.map((r) => present(orgId, r)));
}

export async function getSignatureRequest(orgId: string, id: string, actor: AccessTokenPayload) {
  const request = await repo.findSignatureRequest(orgId, id);
  if (!request) throw new DomainError("NOT_FOUND", "Signature request not found.", 404);
  if (!isPrivileged(actor) && request.recipientEmployeeId !== actor.employeeId) {
    throw new DomainError("NOT_FOUND", "Signature request not found.", 404);
  }
  return { ...(await present(orgId, request)), document: publicDocument(request.document) };
}

async function sign(orgId: string, request: SigRequest, fullName: string, actor: AccessTokenPayload | null) {
  if (request.status === "SIGNED") {
    throw new DomainError("ALREADY_SIGNED", "This document is already signed. Corrections need a new version.", 409);
  }
  if (!(await isActionable(orgId, request))) {
    throw new DomainError("NOT_ACTIONABLE", "This signature request is no longer actionable.", 409);
  }
  const { count } = await repo.markSigned(request.id, { signedByName: fullName, signedByUserId: actor?.sub ?? null });
  if (count === 0) {
    throw new DomainError("ALREADY_SIGNED", "This document is already signed. Corrections need a new version.", 409);
  }
  if (actor) {
    await audit(orgId, actor, "signature.signed", "SignatureRequest", request.id, { signedByName: fullName });
  }
  return present(orgId, (await repo.findSignatureRequest(orgId, request.id))!);
}

// FR-006: only the designated employee recipient signs, as themselves.
export async function signAsEmployee(orgId: string, id: string, fullName: string, actor: AccessTokenPayload) {
  const request = await repo.findSignatureRequest(orgId, id);
  if (!request || request.recipientEmployeeId !== actor.employeeId) {
    throw new DomainError("NOT_FOUND", "Signature request not found.", 404);
  }
  return sign(orgId, request, fullName, actor);
}

async function requestByToken(token: string) {
  const request = await repo.findSignatureRequestByTokenHash(hashToken(token));
  if (!request) throw new DomainError("NOT_FOUND", "This signing link is invalid.", 404);
  return request;
}

export async function getByToken(token: string) {
  const request = await requestByToken(token);
  return { ...(await present(request.orgId, request)), document: publicDocument(request.document) };
}

export async function openByToken(token: string) {
  const request = await requestByToken(token);
  return { doc: publicDocument(request.document), stream: await getStorage().open(request.document.fileUrl) };
}

export async function signByToken(token: string, fullName: string) {
  const request = await requestByToken(token);
  return sign(request.orgId, request, fullName, null);
}

// --- Policies (US3) ---

export async function publishPolicy(orgId: string, title: string, file: UploadedFile | undefined, actor: AccessTokenPayload) {
  let documentId: string | null = null;
  if (file) {
    const key = await store(file, "documents/policies");
    const doc = await repo.createDocumentVersion(orgId, { ownerType: "ORGANIZATION" }, {
      label: `Policy: ${title}`.slice(0, 120),
      fileUrl: key,
      contentType: file.mimetype,
      sizeBytes: file.size,
      originalName: file.originalname.slice(0, 200),
      uploadedById: actor.employeeId,
    });
    documentId = doc.id;
  }
  const policy = await repo.createPolicy({ orgId, title, documentId });
  await audit(orgId, actor, "policy.published", "Policy", policy.id, { title });
  return policy;
}

export async function listPolicies(orgId: string, actor: AccessTokenPayload) {
  const policies = await repo.listPolicies(orgId);
  const mine = actor.employeeId ? await repo.listAcknowledgments(orgId, { employeeId: actor.employeeId }) : [];
  const ackAt = new Map(mine.map((a) => [a.policyId, a.acknowledgedAt]));
  return policies.map((p) => ({ ...p, myAcknowledgedAt: ackAt.get(p.id) ?? null }));
}

// FR-010: one action; repeating it is harmless and returns the original timestamp.
export async function acknowledgePolicy(orgId: string, policyId: string, actor: AccessTokenPayload) {
  if (!(await repo.findPolicy(orgId, policyId))) throw new DomainError("NOT_FOUND", "Policy not found.", 404);
  if (!actor.employeeId) throw new DomainError("FORBIDDEN", "Only employees acknowledge policies.", 403);
  try {
    const ack = await repo.createAcknowledgment(orgId, policyId, actor.employeeId);
    await audit(orgId, actor, "policy.acknowledged", "Policy", policyId);
    return ack;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return repo.findAcknowledgment(policyId, actor.employeeId);
    }
    throw err;
  }
}

// FR-011 / SC-004: computed against today's active employees, so later joiners show as pending.
export async function policyStatus(orgId: string, policyId: string) {
  if (!(await repo.findPolicy(orgId, policyId))) throw new DomainError("NOT_FOUND", "Policy not found.", 404);
  const [employees, acks] = await Promise.all([
    listActiveEmployeeSummaries(orgId),
    repo.listAcknowledgments(orgId, { policyId }),
  ]);
  const ackAt = new Map(acks.map((a) => [a.employeeId, a.acknowledgedAt]));
  const acknowledged = [];
  const pending = [];
  for (const e of employees) {
    const at = ackAt.get(e.id);
    if (at) acknowledged.push({ employeeId: e.id, name: e.name, acknowledgedAt: at });
    else pending.push({ employeeId: e.id, name: e.name });
  }
  return { policyId, acknowledgedCount: acknowledged.length, pendingCount: pending.length, acknowledged, pending };
}
