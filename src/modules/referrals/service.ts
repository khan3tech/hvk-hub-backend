// Business rules for the employee referral program (specs/021-referral-program).
import moment from "moment";
import { DomainError } from "../../middleware/errorHandler.js";
import { logger } from "../../lib/logger.js";
import { findEmployeeSummaryByEmail, getEmployeeSummary, getOffboardedDate } from "../employee/service.js";
import { applyFromOutside, findOrCreateCandidate, findPosting, getApplicationBrief, setCandidateResume } from "../recruitment/service.js";
import { storeCandidateFile, type UploadedFile } from "../documents/service.js";
import { notifyEmployees } from "../notifications/service.js";
import type { OneOffEarningsProvider } from "../payroll/service.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";

type Referral = NonNullable<Awaited<ReturnType<typeof repo.findReferral>>>;
const RESUME_TYPES = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const DAY = 86_400_000;
const isHr = (actor: AccessTokenPayload) => actor.role === "HR" || actor.role === "ADMIN";

// --- Configuration (FR-004/FR-010) ---

export async function getConfig(orgId: string) {
  const c = await repo.findConfig(orgId);
  return { bonusAmount: c?.bonusAmount ?? 0, qualifyingDays: c?.qualifyingDays ?? 0, effectiveFrom: c?.effectiveFrom ?? null, configured: Boolean(c) };
}

export async function setConfig(orgId: string, bonusAmount: number, qualifyingDays: number) {
  await repo.upsertConfig(orgId, bonusAmount, qualifyingDays);
  return getConfig(orgId);
}

// --- Submitting (US1) ---

// FR-001/002/010: a referral is an application through 005's shared path (same duplicate and
// open-posting rules; first channel wins), stamped with today's bonus terms.
export async function submitReferral(
  orgId: string,
  input: { postingId: string; name: string; email: string; phone?: string },
  resume: UploadedFile | undefined,
  actor: AccessTokenPayload,
) {
  if (!actor.employeeId) throw new DomainError("FORBIDDEN", "Only employees can refer candidates.", 403);
  const me = await getEmployeeSummary(orgId, actor.employeeId);
  if (!me || me.status !== "ACTIVE") throw new DomainError("FORBIDDEN", "Only active employees can refer candidates.", 403);
  if (me.email.toLowerCase() === input.email.trim().toLowerCase()) {
    throw new DomainError("VALIDATION_ERROR", "You can't refer yourself.", 400, { email: ["That's your own email."] });
  }
  if (!resume) throw new DomainError("FILE_REQUIRED", "Attach the candidate's resume (PDF or DOCX).", 400);
  if (!RESUME_TYPES.has(resume.mimetype)) throw new DomainError("UNSUPPORTED_FILE_TYPE", "Resumes must be a PDF or DOCX file.", 415);
  const posting = await findPosting(orgId, input.postingId);
  if (!posting) throw new DomainError("NOT_FOUND", "Job posting not found.", 404);
  if (posting.status !== "OPEN") throw new DomainError("POSTING_NOT_OPEN", "This posting is not accepting applications.", 409);

  const candidate = await findOrCreateCandidate(orgId, { name: input.name, email: input.email, phone: input.phone, resumeUrl: "pending" });
  const application = await applyFromOutside(orgId, candidate.id, posting.id, { source: "REFERRAL", referredByEmployeeId: me.id, actorEmployeeId: me.id });
  const doc = await storeCandidateFile(orgId, candidate.id, "Resume", resume);
  await setCandidateResume(orgId, candidate.id, `/api/documents/${doc.id}/download`);

  const terms = await getConfig(orgId);
  const referral = await repo.createReferral({
    orgId,
    referrerEmployeeId: me.id,
    applicationId: application.id,
    bonusAmount: terms.bonusAmount,
    qualifyingDays: terms.qualifyingDays,
  });
  return present(referral, false);
}

// --- Views (FR-003) ---

async function present(r: Referral, forHr: boolean) {
  const app = await getApplicationBrief(r.orgId, r.applicationId);
  const base = {
    id: r.id,
    status: r.status,
    bonusAmount: r.bonusAmount,
    qualifyingDays: r.qualifyingDays,
    hiredAt: r.hiredAt,
    qualifyingUntil: r.qualifyingUntil,
    paidAt: r.paidAt,
    closedReason: r.closedReason,
    candidateName: app?.candidateName ?? null,
    postingTitle: app?.postingTitle ?? null,
    stage: app?.stage ?? null, // stage only — never interview feedback or other pipeline detail
  };
  if (!forHr) return base;
  const referrer = await getEmployeeSummary(r.orgId, r.referrerEmployeeId);
  return {
    ...base,
    referrerEmployeeId: r.referrerEmployeeId,
    referrerName: referrer?.name ?? null,
    referrerActive: referrer?.status === "ACTIVE", // edge case: HR decides, no auto-forfeit
    hireEmployeeId: r.hireEmployeeId,
    applicationId: r.applicationId,
    payrollPeriod: r.payrollPeriodYear ? `${r.payrollPeriodYear}-${String(r.payrollPeriodMonth).padStart(2, "0")}` : null,
  };
}

export async function myReferrals(orgId: string, actor: AccessTokenPayload) {
  if (!actor.employeeId) return [];
  await evaluateQualifying(orgId);
  const list = await repo.listReferrals(orgId, { referrerEmployeeId: actor.employeeId });
  return Promise.all(list.map((r) => present(r, false)));
}

export async function allReferrals(orgId: string, status?: string) {
  await evaluateQualifying(orgId);
  const list = await repo.listReferrals(orgId, status ? { status: status as never } : {});
  return Promise.all(list.map((r) => present(r, true)));
}

// --- Lifecycle (US2) ---

// Registered with recruitment.onApplicationStageChanged() in app.ts (FR-005/FR-007).
export async function onStageChanged(orgId: string, applicationId: string, _from: string, to: string) {
  const r = await repo.findByApplication(applicationId);
  if (!r || r.orgId !== orgId) return;
  if (to === "HIRED") {
    const hiredAt = new Date();
    const qualifyingUntil = new Date(hiredAt.getTime() + r.qualifyingDays * DAY);
    // Zero-length qualifying period: payable on hire (edge case).
    const next = r.qualifyingDays === 0 ? "PAYABLE" : "PENDING";
    const { count } = await repo.transition(r.id, ["IN_PIPELINE"], { status: next, hiredAt, qualifyingUntil });
    if (count) await notifyEmployees(orgId, [r.referrerEmployeeId], { type: "REFERRAL_UPDATED", message: `Your referral was hired — bonus ${next === "PAYABLE" ? "is payable" : `pending until ${moment.utc(qualifyingUntil).format("YYYY-MM-DD")}`}.`, link: `/referrals/${r.id}` });
  } else if (to === "REJECTED") {
    const { count } = await repo.transition(r.id, ["IN_PIPELINE"], { status: "CLOSED_NO_BONUS", closedReason: "Application not successful" });
    if (count) await notifyEmployees(orgId, [r.referrerEmployeeId], { type: "REFERRAL_UPDATED", message: "Your referral wasn't selected — closed with no bonus.", link: `/referrals/${r.id}` });
  } else if (r.status === "PENDING" || r.status === "CLOSED_NO_BONUS") {
    // An HR correction moved the application back into the pipeline before any payout.
    await repo.transition(r.id, ["PENDING", "CLOSED_NO_BONUS"], { status: "IN_PIPELINE", hiredAt: null, qualifyingUntil: null, closedReason: null });
  }
}

// FR-005/FR-006/SC-003: once the qualifying period ends, payable if the hire is still employed;
// forfeited if they left before it ended. The hire is matched to an employee by email unless
// HR linked one explicitly. Idempotent; run by the scheduler and before listings.
export async function evaluateQualifying(orgId?: string, now = new Date()) {
  // One org (before listings) or every org (scheduler).
  const all = orgId ? await repo.listReferrals(orgId, { status: "PENDING" }) : await repo.listPendingAllOrgs();
  for (const r of all) {
    try {
      let hireId = r.hireEmployeeId;
      if (!hireId) {
        const brief = await getApplicationBrief(r.orgId, r.applicationId);
        const match = brief ? await findEmployeeSummaryByEmail(r.orgId, brief.candidateEmail) : null;
        if (match) {
          hireId = match.id;
          await repo.update(r.id, { hireEmployeeId: hireId });
        }
      }
      const hire = hireId ? await getEmployeeSummary(r.orgId, hireId) : null;
      if (hire?.status === "OFFBOARDED") {
        const left = (await getOffboardedDate(r.orgId, hire.id)) ?? now;
        if (!r.qualifyingUntil || left < r.qualifyingUntil) {
          await repo.transition(r.id, ["PENDING"], { status: "FORFEITED", closedReason: "Hire left before the qualifying period ended" });
          continue;
        }
      }
      if (r.qualifyingUntil && now >= r.qualifyingUntil && hire?.status === "ACTIVE") {
        const { count } = await repo.transition(r.id, ["PENDING"], { status: "PAYABLE" });
        if (count) await notifyEmployees(r.orgId, [r.referrerEmployeeId], { type: "REFERRAL_UPDATED", message: "Your referral bonus is now payable.", link: `/referrals/${r.id}` });
      }
      // No employee record yet: stays PENDING until HR links/creates one.
    } catch (err) {
      logger.warn({ err, referralId: r.id }, "referral evaluation failed");
    }
  }
}

// HR links the hire's employee record when the email doesn't match.
export async function linkHire(orgId: string, id: string, employeeId: string) {
  const r = await repo.findReferral(orgId, id);
  if (!r) throw new DomainError("NOT_FOUND", "Referral not found.", 404);
  if (!(await getEmployeeSummary(orgId, employeeId))) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  await repo.update(id, { hireEmployeeId: employeeId });
  await evaluateQualifying(orgId);
  return present((await repo.findReferral(orgId, id))!, true);
}

// --- Payroll (US3, FR-008/FR-009, SC-005) ---

// HR picks the period a payable bonus goes out in; only PAYABLE (never PAID) can be scheduled.
export async function schedulePayout(orgId: string, id: string, periodMonth: number, periodYear: number) {
  const r = await repo.findReferral(orgId, id);
  if (!r) throw new DomainError("NOT_FOUND", "Referral not found.", 404);
  const { count } = await repo.transition(id, ["PAYABLE"], { payrollPeriodMonth: periodMonth, payrollPeriodYear: periodYear });
  if (count === 0) throw new DomainError("NOT_PAYABLE", r.status === "PAID" ? "This bonus was already paid." : "Only a payable bonus can be scheduled.", 409);
  return present((await repo.findReferral(orgId, id))!, true);
}

// Registered with payroll.setOneOffEarningsProvider() in app.ts. A re-run of the same period
// includes the same bonus again (the payslip is replaced, not duplicated); any other period can't.
export const referralEarnings: OneOffEarningsProvider = {
  async list(orgId, employeeId, periodMonth, periodYear) {
    const due = await repo.listReferrals(orgId, {
      referrerEmployeeId: employeeId,
      payrollPeriodMonth: periodMonth,
      payrollPeriodYear: periodYear,
      status: { in: ["PAYABLE", "PAID"] },
    });
    const lines = [];
    for (const r of due) {
      const brief = await getApplicationBrief(orgId, r.applicationId);
      lines.push({ id: r.id, label: `Referral bonus (${brief?.candidateName ?? "referral"})`, amount: r.bonusAmount });
    }
    return lines;
  },
  async markIncluded(_orgId, ids) {
    for (const id of ids) await repo.transition(id, ["PAYABLE"], { status: "PAID", paidAt: new Date() });
  },
};

// Registered with recruitment.onCandidateDeleted() (020 FR-010).
export async function deleteForApplications(applicationIds: string[]) {
  if (applicationIds.length) await repo.deleteForApplications(applicationIds);
}
