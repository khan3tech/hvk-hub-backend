// Prisma queries only — this is the one place in the recruitment module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
// See specs/005-recruitment-ats/spec.md → Key Entities for the data this module owns.
import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "@prisma/client";

export function createJobPosting(data: Prisma.JobPostingUncheckedCreateInput) {
  return prisma.jobPosting.create({ data });
}

export function findJobPostingById(orgId: string, id: string) {
  return prisma.jobPosting.findFirst({ where: { id, orgId } });
}

export function listJobPostings(orgId: string, where: Prisma.JobPostingWhereInput = {}) {
  return prisma.jobPosting.findMany({ where: { orgId, ...where }, orderBy: { title: "asc" } });
}

export function updateJobPosting(id: string, data: Prisma.JobPostingUncheckedUpdateInput) {
  return prisma.jobPosting.update({ where: { id }, data });
}

export function departmentExists(orgId: string, departmentId: string) {
  return prisma.department.count({ where: { id: departmentId, orgId } }).then((n) => n > 0);
}

export function createCandidate(data: Prisma.CandidateUncheckedCreateInput) {
  return prisma.candidate.create({ data });
}

export function findCandidateById(orgId: string, id: string) {
  return prisma.candidate.findFirst({ where: { id, orgId } });
}

export function searchCandidates(orgId: string, q?: string) {
  return prisma.candidate.findMany({
    where: {
      orgId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export function createApplication(data: Prisma.ApplicationUncheckedCreateInput) {
  return prisma.application.create({ data });
}

export function findApplicationById(orgId: string, id: string) {
  return prisma.application.findFirst({
    where: { id, orgId },
    include: { jobPosting: true },
  });
}

export function findApplicationDetail(orgId: string, id: string) {
  return prisma.application.findFirst({
    where: { id, orgId },
    include: {
      candidate: true,
      jobPosting: true,
      interviewRounds: { orderBy: { scheduledAt: "asc" } },
    },
  });
}

export function listApplications(orgId: string, where: Prisma.ApplicationWhereInput = {}) {
  return prisma.application.findMany({
    where: { orgId, ...where },
    include: { candidate: true },
    orderBy: { createdAt: "asc" },
  });
}

export function updateApplicationStage(id: string, stage: Prisma.ApplicationUncheckedUpdateInput["stage"]) {
  return prisma.application.update({ where: { id }, data: { stage } });
}

export function createInterviewRound(data: Prisma.InterviewRoundUncheckedCreateInput) {
  return prisma.interviewRound.create({ data });
}

export function findInterviewRoundById(orgId: string, id: string) {
  return prisma.interviewRound.findFirst({
    where: { id, orgId },
    include: { application: { include: { jobPosting: true } } },
  });
}

export function listInterviewRoundsForInterviewer(orgId: string, interviewerId: string) {
  return prisma.interviewRound.findMany({
    where: { orgId, interviewerId },
    include: {
      application: {
        select: {
          id: true,
          stage: true,
          candidate: { select: { id: true, name: true } },
          jobPosting: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });
}

export function updateInterviewRound(id: string, data: Prisma.InterviewRoundUncheckedUpdateInput) {
  return prisma.interviewRound.update({ where: { id }, data });
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
      orgId: params.orgId,
      actorId: params.actorId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      before: params.before as Prisma.InputJsonValue | undefined,
      after: params.after as Prisma.InputJsonValue | undefined,
    },
  });
}

export function findCandidateByEmail(orgId: string, email: string) {
  return prisma.candidate.findFirst({ where: { orgId, email: email.toLowerCase() }, orderBy: { createdAt: "asc" } });
}

export function updateCandidate(id: string, data: Prisma.CandidateUncheckedUpdateInput) {
  return prisma.candidate.update({ where: { id }, data });
}

export function findApplicationByReferenceHash(hash: string) {
  return prisma.application.findUnique({
    where: { publicReferenceHash: hash },
    include: { candidate: { select: { email: true } }, jobPosting: { select: { title: true } } },
  });
}

export function deleteCandidateCascade(candidateId: string, applicationIds: string[]) {
  return prisma.$transaction([
    prisma.interviewRound.deleteMany({ where: { applicationId: { in: applicationIds } } }),
    prisma.application.deleteMany({ where: { candidateId } }),
    prisma.candidate.delete({ where: { id: candidateId } }),
  ]);
}
