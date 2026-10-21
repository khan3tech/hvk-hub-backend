// Business rules for the recruitment module. Framework-agnostic — no req/res.
// Calls repository.ts for persistence; never imports Prisma directly.
// Implements the functional requirements (FR-xxx) in specs/005-recruitment-ats/spec.md.
import { Prisma } from "@prisma/client";
import { DomainError } from "../../middleware/errorHandler.js";
import { getEmployeeSummary } from "../employee/service.js";
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
  // Edge case: a closed/on-hold posting accepts no new applications.
  if (posting.status !== "OPEN") {
    throw new DomainError("POSTING_NOT_OPEN", "This posting is not accepting applications.", 409);
  }

  let application;
  try {
    application = await repo.createApplication({
      orgId,
      candidateId: candidate.id,
      jobPostingId: posting.id,
      stage: "APPLIED",
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
    actorEmployeeId: actor.employeeId,
    action: "recruitment.application_created",
    entity: "Application",
    entityId: application.id,
    after: { stage: application.stage },
  });
  return toApplication(application);
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
  return toApplication(updated);
}

// --- Interview rounds (User Story 4) ---

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
  return updated;
}

// US4 scenario 1: the assigned interviewer sees the rounds assigned to them.
export async function listMyInterviews(orgId: string, actor: AccessTokenPayload) {
  if (!actor.employeeId) return [];
  return repo.listInterviewRoundsForInterviewer(orgId, actor.employeeId);
}
