// Public careers portal (specs/020-public-careers-portal): an unauthenticated entry point into
// 005's existing pipeline — no records of its own. Organizations are addressed by slug (015).
import { createHash, randomBytes } from "node:crypto";
import { DomainError } from "../../middleware/errorHandler.js";
import { verifyHumanCheck } from "../../lib/botcheck.js";
import { resolveOrganizationSlug } from "../auth/service.js";
import { organizationDirectory } from "../organizations/service.js";
import { listDepartments } from "../employee/service.js";
import { applyFromOutside, findApplicationByReferenceHash, findOrCreateCandidate, findPosting, listOpenPostings, setCandidateResume } from "../recruitment/service.js";
import { storeCandidateFile, type UploadedFile } from "../documents/service.js";

const RESUME_TYPES = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const hashRef = (ref: string) => createHash("sha256").update(ref.trim().toUpperCase()).digest("hex");

// Simplified public view of the internal stages (US3).
export const PUBLIC_STAGE: Record<string, { label: string; final: boolean }> = {
  APPLIED: { label: "Received", final: false },
  SCREEN: { label: "Under review", final: false },
  INTERVIEW: { label: "Interviewing", final: false },
  OFFER: { label: "Offer stage", final: false },
  HIRED: { label: "Hired", final: true },
  REJECTED: { label: "Not selected", final: true },
};

const notFound = () => new DomainError("NOT_FOUND", "This careers page doesn't exist.", 404);

async function orgFor(slug: string) {
  const orgId = await resolveOrganizationSlug(slug);
  if (!orgId || !(await organizationDirectory.isActive(orgId))) throw notFound();
  return orgId;
}

async function publicPosting(orgId: string, p: { id: string; title: string; description: string | null; departmentId: string; openings: number }) {
  const dept = (await listDepartments(orgId)).find((d) => d.id === p.departmentId);
  return { id: p.id, title: p.title, description: p.description, department: dept?.name ?? null, openings: p.openings };
}

// FR-001/FR-002: open postings only.
export async function listPostings(slug: string) {
  const orgId = await orgFor(slug);
  const postings = await listOpenPostings(orgId);
  return Promise.all(postings.map((p) => publicPosting(orgId, p)));
}

export async function getPosting(slug: string, id: string) {
  const orgId = await orgFor(slug);
  const p = await findPosting(orgId, id);
  if (!p || p.status !== "OPEN") throw new DomainError("NOT_FOUND", "This role isn't open.", 404);
  return publicPosting(orgId, p);
}

// FR-003–007/011: bot check, open posting, resume type/size, then 005's own application rules.
export async function apply(
  slug: string,
  postingId: string,
  fields: { name: string; email: string; phone?: string; challenge?: string; solution?: string; website?: string },
  resume: UploadedFile | undefined,
) {
  verifyHumanCheck({ challenge: fields.challenge, solution: fields.solution, honeypot: fields.website }, "careers-apply");
  const orgId = await orgFor(slug);
  if (!resume) throw new DomainError("FILE_REQUIRED", "Attach your resume (PDF or DOCX).", 400);
  if (!RESUME_TYPES.has(resume.mimetype)) {
    throw new DomainError("UNSUPPORTED_FILE_TYPE", "Resumes must be a PDF or DOCX file.", 415);
  }
  const posting = await findPosting(orgId, postingId);
  if (!posting) throw new DomainError("NOT_FOUND", "This role isn't open.", 404);
  if (posting.status !== "OPEN") {
    // FR-006: closed or put on hold since the page was loaded.
    throw new DomainError("POSTING_NOT_OPEN", "This role is no longer accepting applications.", 409);
  }

  const candidate = await findOrCreateCandidate(orgId, { name: fields.name, email: fields.email, phone: fields.phone, resumeUrl: "pending" });
  const reference = `TL-${randomBytes(6).toString("hex").toUpperCase()}`;
  const application = await applyFromOutside(orgId, candidate.id, posting.id, { source: "PUBLIC", publicReferenceHash: hashRef(reference) });
  const doc = await storeCandidateFile(orgId, candidate.id, "Resume", resume);
  await setCandidateResume(orgId, candidate.id, `/api/documents/${doc.id}/download`);

  // US2.3: the reference is shown once; only its hash is stored.
  return {
    applicationId: application.id,
    reference,
    posting: posting.title,
    message: "Thanks — your application was received. Keep this reference to check its status.",
  };
}

// FR-008/FR-009/SC-005: email + reference must both match; every miss looks the same.
export async function checkStatus(slug: string, email: string, reference: string) {
  const orgId = await orgFor(slug);
  const noMatch = new DomainError("NO_MATCH", "No matching application found. Check your email and reference.", 404);
  const app = await findApplicationByReferenceHash(hashRef(reference));
  if (!app || app.orgId !== orgId || app.candidate.email.toLowerCase() !== email.trim().toLowerCase()) throw noMatch;
  const stage = PUBLIC_STAGE[app.stage] ?? { label: "Under review", final: false };
  return { posting: app.jobPosting.title, status: stage.label, final: stage.final, appliedAt: app.createdAt };
}
