// Prisma queries only — this is the one place in the documents module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";
import type { DocumentOwnerType, Prisma } from "@prisma/client";

type Owner = { ownerType: DocumentOwnerType; employeeId?: string | null; candidateId?: string | null };

function ownerWhere(orgId: string, owner: Owner) {
  return {
    orgId,
    ownerType: owner.ownerType,
    employeeId: owner.employeeId ?? null,
    candidateId: owner.candidateId ?? null,
  };
}

// FR-004: a new upload under an existing label becomes the next version; earlier versions stay,
// no longer current. One transaction so there's never zero or two current versions.
export function createDocumentVersion(
  orgId: string,
  owner: Owner,
  data: Omit<Prisma.DocumentUncheckedCreateInput, "orgId" | "ownerType" | "employeeId" | "candidateId" | "version" | "isCurrent">,
) {
  return prisma.$transaction(async (tx) => {
    const where = { ...ownerWhere(orgId, owner), label: data.label };
    const latest = await tx.document.findFirst({ where, orderBy: { version: "desc" } });
    await tx.document.updateMany({ where: { ...where, isCurrent: true }, data: { isCurrent: false } });
    return tx.document.create({
      data: { ...ownerWhere(orgId, owner), ...data, version: (latest?.version ?? 0) + 1, isCurrent: true },
    });
  });
}

export function listDocuments(orgId: string, owner: Owner, opts: { history: boolean; managerVisibleOnly?: boolean }) {
  return prisma.document.findMany({
    where: {
      ...ownerWhere(orgId, owner),
      ...(opts.history ? {} : { isCurrent: true }),
      ...(opts.managerVisibleOnly ? { managerVisible: true } : {}),
    },
    orderBy: [{ label: "asc" }, { version: "desc" }],
  });
}

export function findDocument(orgId: string, id: string) {
  return prisma.document.findFirst({ where: { id, orgId } });
}

export function isPolicyDocument(orgId: string, documentId: string) {
  return prisma.policy.count({ where: { orgId, documentId } }).then((n) => n > 0);
}

export function createSignatureRequest(data: Prisma.SignatureRequestUncheckedCreateInput) {
  return prisma.signatureRequest.create({ data });
}

export function findSignatureRequest(orgId: string, id: string) {
  return prisma.signatureRequest.findFirst({ where: { id, orgId }, include: { document: true } });
}

export function findSignatureRequestByTokenHash(tokenHash: string) {
  return prisma.signatureRequest.findUnique({ where: { accessTokenHash: tokenHash }, include: { document: true } });
}

export function listSignatureRequests(orgId: string, where: Prisma.SignatureRequestWhereInput) {
  return prisma.signatureRequest.findMany({ where: { orgId, ...where }, orderBy: { createdAt: "desc" } });
}

// Conditional update: only the first signature lands (FR-007, concurrent-signing edge case).
export function markSigned(id: string, data: { signedByName: string; signedByUserId?: string | null }) {
  return prisma.signatureRequest.updateMany({
    where: { id, status: "AWAITING" },
    data: { status: "SIGNED", signedAt: new Date(), ...data },
  });
}

export function createPolicy(data: Prisma.PolicyUncheckedCreateInput) {
  return prisma.policy.create({ data });
}

export function findPolicy(orgId: string, id: string) {
  return prisma.policy.findFirst({ where: { id, orgId } });
}

export function listPolicies(orgId: string) {
  return prisma.policy.findMany({ where: { orgId }, orderBy: { publishedAt: "desc" } });
}

export function listAcknowledgments(orgId: string, where: Prisma.PolicyAcknowledgmentWhereInput) {
  return prisma.policyAcknowledgment.findMany({ where: { orgId, ...where } });
}

export function createAcknowledgment(orgId: string, policyId: string, employeeId: string) {
  return prisma.policyAcknowledgment.create({ data: { orgId, policyId, employeeId } });
}

export function findAcknowledgment(policyId: string, employeeId: string) {
  return prisma.policyAcknowledgment.findUnique({ where: { policyId_employeeId: { policyId, employeeId } } });
}

export function writeActivityLog(params: {
  orgId: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}) {
  return prisma.activityLog.create({
    data: {
      ...params,
      before: params.before as Prisma.InputJsonValue | undefined,
      after: params.after as Prisma.InputJsonValue | undefined,
    },
  });
}

// 020 FR-010: everything stored for a candidate, for deletion on request.
export function listAllForCandidate(orgId: string, candidateId: string) {
  return prisma.document.findMany({ where: { orgId, candidateId } });
}

export function deleteForCandidate(orgId: string, candidateId: string, documentIds: string[]) {
  return prisma.$transaction([
    prisma.signatureRequest.deleteMany({ where: { orgId, OR: [{ recipientCandidateId: candidateId }, { documentId: { in: documentIds } }] } }),
    prisma.document.deleteMany({ where: { orgId, candidateId } }),
  ]);
}
