// Prisma queries only — this is the one place in the surveys module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "@prisma/client";

const withQuestions = { questions: { orderBy: { order: "asc" as const } } };

export function createSurvey(data: Prisma.SurveyUncheckedCreateInput, questions: Array<{ type: "ENPS" | "TEXT"; prompt: string }>) {
  return prisma.survey.create({
    data: { ...data, questions: { create: questions.map((q, order) => ({ orgId: data.orgId, ...q, order })) } },
    include: withQuestions,
  });
}

export function findSurvey(orgId: string, id: string) {
  return prisma.survey.findFirst({ where: { id, orgId }, include: withQuestions });
}

export function listSurveys(orgId: string) {
  return prisma.survey.findMany({ where: { orgId }, include: withQuestions, orderBy: { sentAt: "asc" } });
}

export function closeSurvey(id: string) {
  return prisma.survey.updateMany({ where: { id, status: "OPEN" }, data: { status: "CLOSED", closedAt: new Date() } });
}

export function participationFor(orgId: string, employeeId: string) {
  return prisma.surveyParticipation.findMany({ where: { orgId, employeeId }, select: { surveyId: true } });
}

export function countResponses(surveyId: string) {
  return prisma.surveyResponse.count({ where: { surveyId } });
}

// FR-003/FR-004/SC-003: the participation row (who) and the response row (what) are written
// together, but nothing links them: the response gets a random (not time-ordered) id, and both
// rows carry only the calendar day, so neither ids nor timestamps can pair them up.
export function recordAnonymousResponse(
  orgId: string,
  surveyId: string,
  employeeId: string,
  answers: Array<{ questionId: string; scoreValue: number | null; textValue: string | null }>,
) {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  return prisma.$transaction([
    prisma.surveyParticipation.create({ data: { orgId, surveyId, employeeId, respondedAt: day } }),
    prisma.surveyResponse.create({
      data: { id: randomUUID(), orgId, surveyId, submittedAt: day, answers: { create: answers } },
    }),
  ]);
}

export function answersFor(surveyId: string) {
  return prisma.surveyAnswer.findMany({
    where: { response: { surveyId } },
    select: { questionId: true, scoreValue: true, textValue: true },
  });
}
