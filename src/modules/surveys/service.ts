// Business rules for engagement surveys. Framework-agnostic — no req/res.
// Implements specs/018-employee-engagement-surveys/spec.md.
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { DomainError } from "../../middleware/errorHandler.js";
import { listActiveEmployeeSummaries } from "../employee/service.js";
import { notifyEmployees } from "../notifications/service.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import type { CreateSurveyRequest, SubmitResponseRequest } from "./schema.js";

export const DEFAULT_MIN_RESPONSES = 5;
type Survey = NonNullable<Awaited<ReturnType<typeof repo.findSurvey>>>;

const audienceOf = (s: Survey) => new Set((s.audienceEmployeeIds as string[] | null) ?? []);

// FR-007: % promoters (9-10) minus % detractors (0-6), rounded.
export function enps(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// --- HR (US1) ---

// FR-001/002/006/010: created = sent; questions are fixed from here on and the audience is the
// set of active employees at this moment (later joiners never get it).
export async function createSurvey(orgId: string, input: CreateSurveyRequest, actor: AccessTokenPayload) {
  const active = await listActiveEmployeeSummaries(orgId);
  const audience = input.audienceType === "DEPARTMENT" ? active.filter((e) => e.departmentId === input.departmentId) : active;
  if (input.audienceType === "DEPARTMENT" && audience.length === 0) {
    throw new DomainError("VALIDATION_ERROR", "That department has no active employees.", 400, { departmentId: ["Empty audience."] });
  }
  const survey = await repo.createSurvey(
    {
      orgId,
      title: input.title,
      audienceType: input.audienceType,
      departmentId: input.audienceType === "DEPARTMENT" ? input.departmentId ?? null : null,
      sentAt: new Date(),
      audienceEmployeeIds: audience.map((e) => e.id),
      audienceSize: audience.length,
      minResponses: input.minResponses ?? DEFAULT_MIN_RESPONSES,
      createdById: actor.employeeId,
    },
    input.questions,
  );
  await notifyEmployees(orgId, audience.map((e) => e.id), { type: "SURVEY_SENT", message: `New survey: ${input.title}`, link: `/surveys/${survey.id}` });
  return presentForHr(survey, 0);
}

function presentForHr(s: Survey, responses: number) {
  const { audienceEmployeeIds: _ids, ...rest } = s;
  return { ...rest, responses, responseRate: s.audienceSize ? Math.round((responses / s.audienceSize) * 1000) / 10 : 0 };
}

export async function closeSurvey(orgId: string, id: string) {
  if (!(await repo.findSurvey(orgId, id))) throw new DomainError("NOT_FOUND", "Survey not found.", 404);
  const { count } = await repo.closeSurvey(id);
  if (count === 0) throw new DomainError("INVALID_STATE", "This survey is already closed.", 409);
  return getSurveyForHr(orgId, id);
}

export async function listSurveysForHr(orgId: string) {
  const surveys = await repo.listSurveys(orgId);
  return Promise.all(surveys.map(async (s) => presentForHr(s, await repo.countResponses(s.id))));
}

export async function getSurveyForHr(orgId: string, id: string) {
  const s = await repo.findSurvey(orgId, id);
  if (!s) throw new DomainError("NOT_FOUND", "Survey not found.", 404);
  return presentForHr(s, await repo.countResponses(id));
}

// FR-005/SC-004: nothing below the threshold — not even per-question counts.
export async function results(orgId: string, id: string) {
  const s = await repo.findSurvey(orgId, id);
  if (!s) throw new DomainError("NOT_FOUND", "Survey not found.", 404);
  const responses = await repo.countResponses(id);
  const base = { surveyId: id, title: s.title, status: s.status, responses, minResponses: s.minResponses, responseRate: presentForHr(s, responses).responseRate };
  if (responses < s.minResponses) {
    return { ...base, withheld: true, message: "Not enough responses to display results while keeping them anonymous." };
  }
  const answers = await repo.answersFor(id);
  return {
    ...base,
    withheld: false,
    questions: s.questions.map((q) => {
      const mine = answers.filter((a) => a.questionId === q.id);
      if (q.type === "ENPS") {
        const scores = mine.map((a) => a.scoreValue).filter((v): v is number => v !== null);
        const distribution = Array.from({ length: 11 }, (_, n) => scores.filter((v) => v === n).length);
        const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null;
        return { questionId: q.id, type: q.type, prompt: q.prompt, enps: enps(scores), average: avg, distribution };
      }
      // Anonymized: shuffled, no timestamps or response ids.
      return { questionId: q.id, type: q.type, prompt: q.prompt, texts: shuffle(mine.map((a) => a.textValue).filter((t): t is string => Boolean(t))) };
    }),
  };
}

// US3 / FR-008/009: chronological eNPS (surveys meeting the threshold) with response rates;
// open surveys are marked as such.
export async function trend(orgId: string) {
  const out = [];
  for (const s of await repo.listSurveys(orgId)) {
    const r = await results(orgId, s.id);
    const questions = "questions" in r ? (r.questions as Array<{ type: string; enps?: number | null }>) : [];
    const firstEnps = questions.find((q) => q.type === "ENPS")?.enps ?? null;
    out.push({ surveyId: s.id, title: s.title, sentAt: s.sentAt, status: s.status, responseRate: r.responseRate, enps: firstEnps, withheld: r.withheld });
  }
  return out;
}

// --- Employees (US2) ---

// Surveys sent to the caller that are still open and not yet answered.
export async function pendingFor(orgId: string, actor: AccessTokenPayload) {
  if (!actor.employeeId) return [];
  const [surveys, done] = await Promise.all([repo.listSurveys(orgId), repo.participationFor(orgId, actor.employeeId)]);
  const answered = new Set(done.map((d) => d.surveyId));
  return surveys
    .filter((s) => s.status === "OPEN" && audienceOf(s).has(actor.employeeId!) && !answered.has(s.id))
    .map((s) => ({ id: s.id, title: s.title, sentAt: s.sentAt, questions: s.questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt })) }));
}

// FR-003/FR-004: only explicit, complete submissions count; one per employee per survey.
export async function submit(orgId: string, surveyId: string, input: SubmitResponseRequest, actor: AccessTokenPayload) {
  const s = await repo.findSurvey(orgId, surveyId);
  if (!s || !actor.employeeId || !audienceOf(s).has(actor.employeeId)) throw new DomainError("NOT_FOUND", "Survey not found.", 404);
  if (s.status !== "OPEN") throw new DomainError("SURVEY_CLOSED", "This survey is closed.", 409);

  const byQuestion = new Map(input.answers.map((a) => [a.questionId, a]));
  const answers = s.questions.map((q) => {
    const a = byQuestion.get(q.id);
    if (q.type === "ENPS" && (a?.score === undefined || a.score === null)) {
      throw new DomainError("VALIDATION_ERROR", "Answer every 0-10 question.", 400, { answers: [`Missing score for: ${q.prompt}`] });
    }
    return { questionId: q.id, scoreValue: q.type === "ENPS" ? a!.score! : null, textValue: q.type === "TEXT" ? a?.text?.trim() || null : null };
  });
  if (input.answers.some((a) => !s.questions.some((q) => q.id === a.questionId))) {
    throw new DomainError("VALIDATION_ERROR", "Unknown question.", 400, { answers: ["Answer only this survey's questions."] });
  }
  try {
    await repo.recordAnonymousResponse(orgId, surveyId, actor.employeeId, answers);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DomainError("ALREADY_RESPONDED", "You've already responded to this survey.", 409);
    }
    throw err;
  }
  return { submitted: true };
}
