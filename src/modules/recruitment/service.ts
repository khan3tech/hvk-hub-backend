// Business rules for the recruitment module. Framework-agnostic — no req/res.
// Calls repository.ts for persistence; never imports Prisma directly.
// Implements the functional requirements (FR-xxx) in specs/005-recruitment-ats/spec.md.
import { Prisma } from "@prisma/client";
import { DomainError } from "../../middleware/errorHandler.js";
import { getEmployeeSummary } from "../employee/service.js";
import { notifyDepartmentManagers, notifyEmployees, notifyRoles } from "../notifications/service.js";
import { logger } from "../../lib/logger.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import type {
  ApplicationStage,
  CreateApplicationRequest,
  CreateCandidateRequest,
  CreateJobPostingRequest,
  RecordInterviewResultRequest,
  ScheduleInterviewRequest,
  UpdateJobPostingRequest,
} from "./schema.js";

// FR-009 / research.md R1: HIRED and REJECTED end the pipeline.
export const TERMINAL_STAGES: readonly ApplicationStage[] = ["HIRED", "REJECTED"];

function isPrivileged(actor: AccessTokenPayload) {
  return actor.role === "HR" || actor.role === "ADMIN";
}

async function logActivity(params: {
  orgId: string;
  actorEmployeeId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}) {
  if (!params.actorEmployeeId) return;
  await repo.writeActivityLog({
    orgId: params.orgId,
    actorId: params.actorEmployeeId,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId,
    before: params.before,
    after: params.after,
  });
}

// research.md R2: a Manager's department is read live from 002's Employee record, so a
// department move takes effect on the next request.
async function managerDepartmentId(orgId: string, actor: AccessTokenPayload): Promise<string | null> {
  if (actor.role !== "MANAGER" || !actor.employeeId) return null;
  const self = await getEmployeeSummary(orgId, actor.employeeId);
  return self?.departmentId ?? null;
}

// FR-008 / FR-014 / SC-005: HR/Admin see every posting's pipeline; a Manager only their own
// department's; everyone else none.
async function assertCanViewPipeline(orgId: string, actor: AccessTokenPayload, departmentId: string) {
  if (isPrivileged(actor)) return;
  const dept = await managerDepartmentId(orgId, actor);
  if (dept && dept === departmentId) return;
  throw new DomainError(
    "FORBIDDEN",
    "You can only view applicants for postings in your own department.",
    403,
  );
}

function toApplication<T extends { stage: ApplicationStage }>(application: T) {
  return { ...application, isTerminal: TERMINAL_STAGES.includes(application.stage) };
}

async function requireActiveEmployee(orgId: string, employeeId: string) {
  const employee = await getEmployeeSummary(orgId, employeeId);
  if (!employee) {
    throw new DomainError("INTERVIEWER_INVALID", "The selected interviewer does not exist.", 409);
  }
  if (employee.status !== "ACTIVE") {
    throw new DomainError("INTERVIEWER_INVALID", "The selected interviewer is offboarded.", 409);
  }
  return employee;
}

// --- Job postings (User Story 1) ---

export async function createJobPosting(
  orgId: string,
  input: CreateJobPostingRequest,
  actor: AccessTokenPayload,
) {
  if (!(await repo.departmentExists(orgId, input.departmentId))) {
    throw new DomainError("VALIDATION_ERROR", "Department not found.", 400, {
      departmentId: ["Unknown department."],
    });
  }
  const posting = await repo.createJobPosting({ orgId, ...input, status: "OPEN" });
  await logActivity({
    orgId,
    actorEmployeeId: actor.employeeId,
    action: "recruitment.posting_created",
    entity: "JobPosting",
    entityId: posting.id,
    after: posting,
  });
  return posting;
}

export async function updateJobPosting(
  orgId: string,
  id: string,
  input: UpdateJobPostingRequest,
  actor: AccessTokenPayload,
) {
  const existing = await repo.findJobPostingById(orgId, id);
  if (!existing) throw new DomainError("NOT_FOUND", "Job posting not found.", 404);

  const updated = await repo.updateJobPosting(id, input);
  await logActivity({
    orgId,
    actorEmployeeId: actor.employeeId,
    action: "recruitment.posting_updated",
    entity: "JobPosting",
    entityId: id,
    before: { status: existing.status, openings: existing.openings },
    after: { status: updated.status, openings: updated.openings },
  });
  return updated;
}

// FR-014: everyone sees OPEN postings; HR/Admin see every status; a Manager also sees every
// status for their own department (spec US1 scenario 3).
export async function listJobPostings(
  orgId: string,
  actor: AccessTokenPayload,
  filters: { status?: string; departmentId?: string } = {},
) {
  const where: Prisma.JobPostingWhereInput = {};
  if (filters.departmentId) where.departmentId = filters.departmentId;

  if (isPrivileged(actor)) {
    if (filters.status) where.status = filters.status as Prisma.EnumJobPostingStatusFilter["equals"];
    return repo.listJobPostings(orgId, where);
  }

  const dept = await managerDepartmentId(orgId, actor);
  const visibility: Prisma.JobPostingWhereInput[] = [{ status: "OPEN" }];
  if (dept) visibility.push({ departmentId: dept });
  where.OR = visibility;
  if (filters.status) where.status = filters.status as Prisma.EnumJobPostingStatusFilter["equals"];
  return repo.listJobPostings(orgId, where);
}

export async function getJobPosting(orgId: string, id: string, actor: AccessTokenPayload) {
  const posting = await repo.findJobPostingById(orgId, id);
  if (!posting) throw new DomainError("NOT_FOUND", "Job posting not found.", 404);
  if (posting.status !== "OPEN" && !isPrivileged(actor)) {
    // Non-open postings are pipeline detail: same rule as the pipeline itself.
    await assertCanViewPipeline(orgId, actor, posting.departmentId);
  }
  return posting;
}

// --- Candidates (User Story 2) ---

export async function createCandidate(
  orgId: string,
  input: CreateCandidateRequest,
  actor: AccessTokenPayload,
) {
  const candidate = await repo.createCandidate({
    orgId,
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone,
    resumeUrl: input.resumeUrl,
  });
  await logActivity({
    orgId,
    actorEmployeeId: actor.employeeId,
    action: "recruitment.candidate_created",
    entity: "Candidate",
    entityId: candidate.id,
  });
  return candidate;
}

export async function searchCandidates(orgId: string, q?: string) {
  return repo.searchCandidates(orgId, q?.trim() || undefined);
}

export async function getCandidate(orgId: string, id: string) {
  const candidate = await repo.findCandidateById(orgId, id);
  if (!candidate) throw new DomainError("NOT_FOUND", "Candidate not found.", 404);
  return candidate;
}

// Unscoped read for other modules (e.g. 008 attaching a signed offer to an application).
export async function getApplicationSummary(orgId: string, id: string) {
  const application = await repo.findApplicationById(orgId, id);
  if (!application) return null;
  return {
    id: application.id,
    candidateId: application.candidateId,
    jobPostingId: application.jobPostingId,
    stage: application.stage,
  };
}

// --- Applications & pipeline (User Stories 2 and 3) ---

export async function createApplication(
  orgId: string,
  input: CreateApplicationRequest,
  actor: AccessTokenPayload,
) {
  const [candidate, posting] = await Promise.all([
    repo.findCandidateById(orgId, input.candidateId),
    repo.findJobPostingById(orgId, input.jobPostingId),
  ]);
  if (!candidate) throw new DomainError("NOT_FOUND", "Candidate not found.", 404);
  if (!posting) throw new DomainError("NOT_FOUND", "Job posting not found.", 404);
  return applyCandidate(orgId, candidate.id, posting, { source: "INTERNAL", actorEmployeeId: actor.employeeId });
}

// Shared by the internal path (above) and the public/referral entry points, so all get exactly
// the same rules: open postings only (POSTING_NOT_OPEN) and one application per
// candidate/posting (FR-005, 020 SC-004).
async function applyCandidate(
  orgId: string,
  candidateId: string,
  posting: { id: string; status: string },
  opts: {
    source: "INTERNAL" | "PUBLIC" | "REFERRAL";
    actorEmployeeId: string | null;
    publicReferenceHash?: string;
    referredByEmployeeId?: string;
  },
) {
  // Edge case: a closed/on-hold posting accepts no new applications.
  if (posting.status !== "OPEN") {
    throw new DomainError("POSTING_NOT_OPEN", "This posting is not accepting applications.", 409);
  }

  let application;
  try {
    application = await repo.createApplication({
      orgId,
      candidateId,
      jobPostingId: posting.id,
      stage: "APPLIED",
      source: opts.source,
      publicReferenceHash: opts.publicReferenceHash ?? null,
      referredByEmployeeId: opts.referredByEmployeeId ?? null,
    });
  } catch (err) {
    // FR-005 / SC-004: the @@unique([candidateId, jobPostingId]) constraint is the backstop,
    // including for two concurrent requests.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DomainError(
        "DUPLICATE_APPLICATION",
        "This candidate has already applied to this posting.",
        409,
      );
    }
    throw err;
  }

  await logActivity({
    orgId,
    actorEmployeeId: opts.actorEmployeeId,
    action: "recruitment.application_created",
    entity: "Application",
    entityId: application.id,
    after: { stage: application.stage, source: opts.source },
  });
  return toApplication(application);
}

// --- Entry points for other modules (020 careers, 021 referrals) ---

export async function listOpenPostings(orgId: string) {
  return repo.listJobPostings(orgId, { status: "OPEN" });
}

export async function findPosting(orgId: string, id: string) {
  return repo.findJobPostingById(orgId, id);
}

// One candidate record per email within an org, so duplicate detection spans every entry point
// (020 SC-004). Existing details are kept; a new resume link replaces the old one.
export async function findOrCreateCandidate(orgId: string, input: { name: string; email: string; phone?: string; resumeUrl: string }) {
  const email = input.email.toLowerCase();
  const existing = await repo.findCandidateByEmail(orgId, email);
  if (existing) return repo.updateCandidate(existing.id, { resumeUrl: input.resumeUrl, ...(input.phone ? { phone: input.phone } : {}) });
  return repo.createCandidate({ orgId, name: input.name, email, phone: input.phone, resumeUrl: input.resumeUrl });
}

export async function setCandidateResume(orgId: string, candidateId: string, resumeUrl: string) {
  if (!(await repo.findCandidateById(orgId, candidateId))) throw new DomainError("NOT_FOUND", "Candidate not found.", 404);
  return repo.updateCandidate(candidateId, { resumeUrl });
}

export async function applyFromOutside(
  orgId: string,
  candidateId: string,
  postingId: string,
  opts: { source: "PUBLIC" | "REFERRAL"; publicReferenceHash?: string; referredByEmployeeId?: string; actorEmployeeId?: string | null },
) {
  const posting = await repo.findJobPostingById(orgId, postingId);
  if (!posting) throw new DomainError("NOT_FOUND", "Job posting not found.", 404);
  return applyCandidate(orgId, candidateId, posting, { ...opts, actorEmployeeId: opts.actorEmployeeId ?? null });
}

// 021: what a referrer may see about their referral — stage only, never interview feedback.
export async function getApplicationBrief(orgId: string, id: string) {
  const a = await repo.findApplicationDetail(orgId, id);
  if (!a) return null;
  return { id: a.id, stage: a.stage, candidateName: a.candidate.name, candidateEmail: a.candidate.email, postingTitle: a.jobPosting.title };
}

export async function findApplicationByReferenceHash(hash: string) {
  return repo.findApplicationByReferenceHash(hash);
}

// 020 FR-010: data-subject removal of a candidate and everything recruitment holds on them.
// Other modules register cleanup for their own rows (documents, referrals, checks).
type CandidateCleanup = (orgId: string, candidateId: string, applicationIds: string[]) => Promise<void>;
const candidateCleanups: CandidateCleanup[] = [];

export function onCandidateDeleted(cleanup: CandidateCleanup): void {
  candidateCleanups.push(cleanup);
}

export async function deleteCandidate(orgId: string, id: string, actor: AccessTokenPayload) {
  const candidate = await repo.findCandidateById(orgId, id);
  if (!candidate) throw new DomainError("NOT_FOUND", "Candidate not found.", 404);
  const applicationIds = (await repo.listApplications(orgId, { candidateId: id })).map((a) => a.id);
  for (const cleanup of candidateCleanups) await cleanup(orgId, id, applicationIds);
  await repo.deleteCandidateCascade(id, applicationIds);
  // The audit row records only that a removal happened, never personal data.
  await logActivity({
    orgId,
    actorEmployeeId: actor.employeeId,
    action: "recruitment.candidate_deleted",
    entity: "Candidate",
    entityId: id,
    after: { applications: applicationIds.length },
  });
}

export async function listApplicationsForPosting(
  orgId: string,
  jobPostingId: string,
  actor: AccessTokenPayload,
) {
  const posting = await repo.findJobPostingById(orgId, jobPostingId);
  if (!posting) throw new DomainError("NOT_FOUND", "Job posting not found.", 404);
  await assertCanViewPipeline(orgId, actor, posting.departmentId);
  const applications = await repo.listApplications(orgId, { jobPostingId });
  return applications.map(toApplication);
}

export async function getApplication(orgId: string, id: string, actor: AccessTokenPayload) {
  const application = await repo.findApplicationDetail(orgId, id);
  if (!application) throw new DomainError("NOT_FOUND", "Application not found.", 404);
  await assertCanViewPipeline(orgId, actor, application.jobPosting.departmentId);
  return toApplication(application);
}

// FR-006/FR-007/FR-008: HR/Admin may move to any stage, including backward or out of a terminal
// stage as a correction; a department Manager may move their own department's in-progress
// applications only. Every change is audited.
export async function moveApplicationStage(
  orgId: string,
  id: string,
  stage: ApplicationStage,
  actor: AccessTokenPayload,
) {
  const application = await repo.findApplicationById(orgId, id);
  if (!application) throw new DomainError("NOT_FOUND", "Application not found.", 404);

  if (!isPrivileged(actor)) {
    const dept = await managerDepartmentId(orgId, actor);
    if (!dept || dept !== application.jobPosting.departmentId) {
      throw new DomainError(
        "FORBIDDEN",
        "You can only move applications for postings in your own department.",
        403,
      );
    }
    if (TERMINAL_STAGES.includes(application.stage)) {
      throw new DomainError(
        "APPLICATION_FINAL",
        "This application has a final outcome. Ask HR to correct it if needed.",
        409,
      );
    }
  }

  if (application.stage === stage) return toApplication(application);

  const updated = await repo.updateApplicationStage(id, stage);
  await logActivity({
    orgId,
    actorEmployeeId: actor.employeeId,
    action: "recruitment.stage_changed",
    entity: "Application",
    entityId: id,
    before: { stage: application.stage },
    after: { stage },
  });
  for (const hook of stageHooks) {
    try {
      await hook(orgId, id, application.stage, stage, actor);
    } catch (err) {
      logger.error({ err, applicationId: id }, "application stage hook failed");
    }
  }
  return toApplication(updated);
}

// 021: features reacting to pipeline outcomes (e.g. referral bonuses) register here (app.ts).
type StageHook = (orgId: string, applicationId: string, from: ApplicationStage, to: ApplicationStage, actor: AccessTokenPayload) => Promise<void>;
const stageHooks: StageHook[] = [];

export function onApplicationStageChanged(hook: StageHook): void {
  stageHooks.push(hook);
}

// --- Interview rounds (User Story 4) ---

// 006 FR-004: the assigned interviewer is told the application, date and time (in-app + email).
async function notifyInterviewer(orgId: string, round: { interviewerId: string; scheduledAt: Date; applicationId: string }) {
  const detail = await repo.findApplicationDetail(orgId, round.applicationId);
  const what = detail ? `${detail.candidate.name} for ${detail.jobPosting.title}` : "a candidate";
  const message = `You're interviewing ${what} on ${round.scheduledAt.toISOString().replace("T", " ").slice(0, 16)} UTC.`;
  await notifyEmployees(orgId, [round.interviewerId], {
    type: "INTERVIEW_SCHEDULED",
    message,
    link: `/recruitment/applications/${round.applicationId}`,
    email: { subject: "Interview scheduled", text: message },
  });
}

export async function scheduleInterview(
  orgId: string,
  applicationId: string,
  input: ScheduleInterviewRequest,
  actor: AccessTokenPayload,
) {
  const application = await repo.findApplicationById(orgId, applicationId);
  if (!application) throw new DomainError("NOT_FOUND", "Application not found.", 404);
  if (application.stage !== "INTERVIEW") {
    throw new DomainError(
      "WRONG_STAGE",
      "Interviews can only be scheduled for applications in the interview stage.",
      409,
    );
  }
  await requireActiveEmployee(orgId, input.interviewerId);

  const round = await repo.createInterviewRound({
    orgId,
    applicationId,
    interviewerId: input.interviewerId,
    scheduledAt: new Date(input.scheduledAt),
  });
  await logActivity({
    orgId,
    actorEmployeeId: actor.employeeId,
    action: "recruitment.interview_scheduled",
    entity: "InterviewRound",
    entityId: round.id,
    after: { interviewerId: round.interviewerId, scheduledAt: round.scheduledAt },
  });
  await notifyInterviewer(orgId, round);
  return round;
}

// FR-012 / edge case: an offboarded interviewer's pending round can be handed to someone else.
export async function reassignInterview(
  orgId: string,
  roundId: string,
  interviewerId: string,
  actor: AccessTokenPayload,
) {
  const round = await repo.findInterviewRoundById(orgId, roundId);
  if (!round) throw new DomainError("NOT_FOUND", "Interview round not found.", 404);
  if (round.result !== "PENDING") {
    throw new DomainError("RESULT_ALREADY_RECORDED", "This interview already has a result.", 409);
  }
  await requireActiveEmployee(orgId, interviewerId);

  const updated = await repo.updateInterviewRound(roundId, { interviewerId });
  await logActivity({
    orgId,
    actorEmployeeId: actor.employeeId,
    action: "recruitment.interview_reassigned",
    entity: "InterviewRound",
    entityId: roundId,
    before: { interviewerId: round.interviewerId },
    after: { interviewerId },
  });
  await notifyInterviewer(orgId, updated);
  return updated;
}

// FR-011 / SC-003: only the assigned interviewer, or HR/Admin, records a result — once.
export async function recordInterviewResult(
  orgId: string,
  roundId: string,
  input: RecordInterviewResultRequest,
  actor: AccessTokenPayload,
) {
  const round = await repo.findInterviewRoundById(orgId, roundId);
  if (!round) throw new DomainError("NOT_FOUND", "Interview round not found.", 404);
  if (!isPrivileged(actor) && round.interviewerId !== actor.employeeId) {
    throw new DomainError(
      "FORBIDDEN",
      "Only the assigned interviewer can record a result for this interview.",
      403,
    );
  }
  if (round.result !== "PENDING") {
    throw new DomainError("RESULT_ALREADY_RECORDED", "This interview already has a result.", 409);
  }

  const updated = await repo.updateInterviewRound(roundId, {
    result: input.result,
    feedback: input.feedback,
    recordedAt: new Date(),
  });
  await logActivity({
    orgId,
    actorEmployeeId: actor.employeeId,
    action: "recruitment.interview_result_recorded",
    entity: "InterviewRound",
    entityId: roundId,
    after: { result: input.result },
  });

  // 006 FR-005: HR/Admin and the posting department's Manager(s), in-app only.
  const event = {
    type: "INTERVIEW_RESULT_RECORDED" as const,
    message: `Interview result recorded: ${input.result} for "${round.application.jobPosting.title}".`,
    link: `/recruitment/applications/${round.applicationId}`,
  };
  await notifyRoles(orgId, ["HR", "ADMIN"], event);
  await notifyDepartmentManagers(orgId, round.application.jobPosting.departmentId, event);
  return updated;
}

// US4 scenario 1: the assigned interviewer sees the rounds assigned to them.
export async function listMyInterviews(orgId: string, actor: AccessTokenPayload) {
  if (!actor.employeeId) return [];
  return repo.listInterviewRoundsForInterviewer(orgId, actor.employeeId);
}
