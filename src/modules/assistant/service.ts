// HR assistant (specs/027-hr-assistant-chatbot). Read-only: every answer is built from the
// asker's own records (through the same services and scoping as the rest of the API) or from
// HR-authored knowledge articles, with a source to follow. Anything else is declined.
import moment from "moment";
import { DomainError } from "../../middleware/errorHandler.js";
import { getMyLeaveBalances, listHolidays, listLeaveTypes } from "../attendance/service.js";
import { getMyPayslips } from "../payroll/service.js";
import { myClaims } from "../expenses/service.js";
import { myTickets } from "../helpdesk/service.js";
import { listPolicies } from "../documents/service.js";
import * as repo from "./repository.js";
import { articleScore, keywordClassifier, mentionsSomeoneElse, splitQuestion, terms, topicOf, type Intent, type IntentClassifier } from "./intents.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";

export type GroundingType = "PERSONAL_DATA" | "POLICY" | "SYSTEM_SETTING";
export interface Source { type: string; label: string; link: string }
export interface AnswerPart {
  question: string;
  answered: boolean;
  topic: string;
  text: string;
  grounding: GroundingType | null;
  sources: Source[];
  reason?: "OUT_OF_SCOPE" | "NO_GROUNDING" | "NO_RECORDS";
}

let classifier: IntentClassifier = keywordClassifier;
export function setIntentClassifier(next: IntentClassifier): void {
  classifier = next;
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const day = (d: Date) => d.toISOString().slice(0, 10);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const decline = (question: string, topic: string, reason: AnswerPart["reason"], text: string, sources: Source[] = []): AnswerPart =>
  ({ question, answered: false, topic, text, grounding: null, sources, reason });

// --- Grounded answers ---

async function leaveBalance(orgId: string, actor: AccessTokenPayload, part: string): Promise<Omit<AnswerPart, "question" | "topic">> {
  const [balances, types] = await Promise.all([getMyLeaveBalances(orgId, actor.employeeId!), listLeaveTypes(orgId)]);
  const name = new Map(types.map((t) => [t.id, t.name]));
  const rows = balances.map((b) => ({ type: name.get(b.leaveTypeId) ?? "Leave", remaining: b.allocated - b.used, allocated: b.allocated, used: b.used }));
  if (rows.length === 0) return { answered: false, text: "No leave types are set up for your organization yet.", grounding: null, sources: [], reason: "NO_RECORDS" };
  const asked = terms(part);
  const specific = rows.filter((r) => terms(r.type).some((w) => asked.includes(w) && !["leave", "days"].includes(w)));
  const shown = specific.length ? specific : rows;
  const year = moment.utc().year();
  const text = shown.map((r) => `${r.type}: ${fmt(r.remaining)} day(s) left of ${fmt(r.allocated)} (${fmt(r.used)} used) in ${year}.`).join(" ");
  return { answered: true, text, grounding: "PERSONAL_DATA", sources: [{ type: "leave-balance", label: `Your ${year} leave balances`, link: "/api/leave-balances/me" }] };
}

async function leaveEntitlement(orgId: string): Promise<Omit<AnswerPart, "question" | "topic">> {
  const types = await listLeaveTypes(orgId);
  if (types.length === 0) return { answered: false, text: "No leave types are configured yet.", grounding: null, sources: [], reason: "NO_GROUNDING" };
  const text = "Configured leave types: " + types.map((t) => `${t.name} — ${fmt(t.defaultDays)} day(s) a year (${t.isPaid ? "paid" : "unpaid"})`).join("; ") + ".";
  return { answered: true, text, grounding: "SYSTEM_SETTING", sources: [{ type: "leave-types", label: "Leave types", link: "/api/leave-types" }] };
}

async function holidays(orgId: string): Promise<Omit<AnswerPart, "question" | "topic">> {
  const today = moment.utc().startOf("day").toDate();
  const year = moment.utc().year();
  const upcoming = [...(await listHolidays(orgId, year)), ...(await listHolidays(orgId, year + 1))].filter((h) => h.date >= today).slice(0, 5);
  if (upcoming.length === 0) return { answered: false, text: "No upcoming holidays are on the calendar.", grounding: null, sources: [], reason: "NO_RECORDS" };
  return {
    answered: true,
    text: "Upcoming holidays: " + upcoming.map((h) => `${h.name} on ${day(h.date)}`).join("; ") + ".",
    grounding: "SYSTEM_SETTING",
    sources: [{ type: "holidays", label: "Holiday calendar", link: "/api/holidays" }],
  };
}

type Line = { name: string; amount: number };
function payslipLines(p: { earnings: unknown; deductions: unknown; statutoryDeductions: unknown }) {
  const obj = (v: unknown): Line[] => Object.entries((v ?? {}) as Record<string, number>).map(([name, amount]) => ({ name, amount: Number(amount) }));
  return {
    earnings: obj(p.earnings),
    deductions: obj(p.deductions).filter((l) => l.amount !== 0),
    statutory: ((p.statutoryDeductions ?? []) as Line[]).map((l) => ({ name: l.name, amount: Number(l.amount) })),
  };
}

// US1.2: explain the asker's real payslip — a named deduction if they asked about one.
async function payslip(orgId: string, actor: AccessTokenPayload, part: string): Promise<Omit<AnswerPart, "question" | "topic">> {
  const slips = await getMyPayslips(orgId, actor.employeeId!);
  const latest = slips[0];
  if (!latest) return { answered: false, text: "You don't have any payslips yet.", grounding: null, sources: [], reason: "NO_RECORDS" };
  const cur = latest.currency ? `${latest.currency} ` : "";
  const period = `${MONTHS[latest.periodMonth - 1]} ${latest.periodYear}`;
  const lines = payslipLines(latest);
  const allDeductions = [...lines.deductions, ...lines.statutory];
  const asked = terms(part);
  const match = allDeductions.filter((l) => terms(l.name.replace(/([a-z])([A-Z])/g, "$1 $2")).some((w) => asked.includes(w)));
  const gross = lines.earnings.reduce((s, l) => s + l.amount, 0);
  let text: string;
  if (match.length) {
    text = `On your ${period} payslip: ` + match.map((l) => `${l.name} was ${cur}${fmt(l.amount)}`).join("; ") + `. Net pay was ${cur}${fmt(latest.netPay)}.`;
  } else {
    const ded = allDeductions.length ? allDeductions.map((l) => `${l.name} ${cur}${fmt(l.amount)}`).join(", ") : "none";
    text = `Your ${period} payslip: gross ${cur}${fmt(gross)} (${lines.earnings.map((l) => `${l.name} ${cur}${fmt(l.amount)}`).join(", ")}); deductions: ${ded}; net pay ${cur}${fmt(latest.netPay)}.`;
  }
  return { answered: true, text, grounding: "PERSONAL_DATA", sources: [{ type: "payslip", label: `Payslip ${period}`, link: `/api/payroll/payslips/me/${latest.id}` }] };
}

async function expenseStatus(orgId: string, actor: AccessTokenPayload): Promise<Omit<AnswerPart, "question" | "topic">> {
  const claims = await myClaims(orgId, actor);
  if (claims.length === 0) return { answered: false, text: "You haven't submitted any expense claims.", grounding: null, sources: [], reason: "NO_RECORDS" };
  const recent = claims.slice(0, 3);
  const text = recent.map((c) => `${c.category} claim of ${fmt(c.amount)} from ${day(c.createdAt)}: ${c.status.toLowerCase()}${c.rejectionReason ? ` (${c.rejectionReason})` : ""}`).join("; ") + ".";
  return { answered: true, text: `Your latest expense claims — ${text}`, grounding: "PERSONAL_DATA", sources: recent.map((c) => ({ type: "expense-claim", label: `${c.category} claim`, link: `/api/expenses/claims/${c.id}` })) };
}

async function ticketStatus(orgId: string, actor: AccessTokenPayload): Promise<Omit<AnswerPart, "question" | "topic">> {
  const tickets = await myTickets(orgId, actor);
  if (tickets.length === 0) return { answered: false, text: "You haven't raised any helpdesk tickets.", grounding: null, sources: [], reason: "NO_RECORDS" };
  const recent = tickets.slice(0, 3);
  return {
    answered: true,
    text: "Your latest helpdesk tickets — " + recent.map((t) => `"${t.subject}": ${t.status.toLowerCase().replace(/_/g, " ")}`).join("; ") + ".",
    grounding: "PERSONAL_DATA",
    sources: [{ type: "helpdesk", label: "My tickets", link: "/api/helpdesk/tickets/me" }],
  };
}

// FR-004/FR-009: HR's current articles, read fresh each time; quoted, never paraphrased.
async function policy(orgId: string, actor: AccessTokenPayload, part: string): Promise<Omit<AnswerPart, "question" | "topic">> {
  const [articles, policies] = await Promise.all([repo.listArticles(orgId), listPolicies(orgId, actor)]);
  const ranked = articles
    .map((a) => ({ a, score: articleScore(part, { title: a.title, keywords: (a.keywords as string[]) ?? [] }) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);
  const best = ranked[0]?.a;
  if (best) {
    const doc = best.policyId ? policies.find((p) => p.id === best.policyId) : undefined;
    const sources: Source[] = [{ type: "knowledge-article", label: best.title, link: `/api/assistant/knowledge/${best.id}` }];
    if (doc?.documentId) sources.push({ type: "policy", label: doc.title, link: `/api/documents/${doc.documentId}/download` });
    return { answered: true, text: `${best.body}\n\nSource: ${doc ? `${doc.title} (via "${best.title}")` : best.title}.`, grounding: "POLICY", sources };
  }
  // A published document whose title matches is offered as a pointer, not as an answer.
  const qTerms = new Set(terms(part));
  const docs = policies.filter((p) => p.documentId && terms(p.title).filter((w) => qTerms.has(w)).length >= 1).slice(0, 2);
  return {
    answered: false,
    reason: "NO_GROUNDING",
    text: docs.length
      ? `I don't have an answer for that, but this published policy may cover it: ${docs.map((d) => d.title).join(", ")}.`
      : "I don't have an answer for that in the company's policies. You can raise a helpdesk ticket and HR will reply.",
    grounding: null,
    sources: docs.map((d) => ({ type: "policy", label: d.title, link: `/api/documents/${d.documentId}/download` })),
  };
}

const PERSONAL: Set<Intent> = new Set(["LEAVE_BALANCE", "PAYSLIP", "EXPENSE_STATUS", "TICKET_STATUS"]);

// A leave question about a kind of leave the org hasn't configured (e.g. "parental leave" with no
// such type) is a policy question: answering it with the generic leave-type list would not be
// grounded in what was asked (FR-005).
async function refineLeaveIntent(orgId: string, part: string, intent: Intent): Promise<Intent> {
  if ((intent !== "LEAVE_BALANCE" && intent !== "LEAVE_ENTITLEMENT") || topicOf(part, "POLICY") === "other") return intent;
  const asked = new Set(terms(part));
  const types = await listLeaveTypes(orgId);
  const named = types.some((t) => terms(t.name).some((w) => asked.has(w) && w !== "leave"));
  return named ? intent : "POLICY";
}

async function answerPart(orgId: string, actor: AccessTokenPayload, part: string): Promise<AnswerPart> {
  const intent = await refineLeaveIntent(orgId, part, classifier.classify(part));
  const topic = topicOf(part, intent);
  if (PERSONAL.has(intent)) {
    // FR-003, SC-002: a new interface onto the asker's own data — never a new access path.
    if (mentionsSomeoneElse(part)) {
      return decline(part, topic, "OUT_OF_SCOPE", "I can only answer questions about your own records. For anyone else's, please ask HR.");
    }
    if (!actor.employeeId) return decline(part, topic, "NO_RECORDS", "Your account isn't linked to an employee record.");
  }
  const handlers: Record<Intent, () => Promise<Omit<AnswerPart, "question" | "topic">>> = {
    LEAVE_BALANCE: () => leaveBalance(orgId, actor, part),
    LEAVE_ENTITLEMENT: () => leaveEntitlement(orgId),
    HOLIDAYS: () => holidays(orgId),
    PAYSLIP: () => payslip(orgId, actor, part),
    EXPENSE_STATUS: () => expenseStatus(orgId, actor),
    TICKET_STATUS: () => ticketStatus(orgId, actor),
    POLICY: () => policy(orgId, actor, part),
  };
  return { question: part, topic, ...(await handlers[intent]()) };
}

// FR-001/FR-010: each part of the question is answered or declined on its own.
export async function ask(orgId: string, question: string, actor: AccessTokenPayload) {
  const parts = splitQuestion(question);
  if (parts.length === 0) throw new DomainError("VALIDATION_ERROR", "Ask a question.", 400);
  const answers = await Promise.all(parts.map((p) => answerPart(orgId, actor, p)));
  // FR-007: recorded per part without identity or text, timestamped to the day only.
  const today = moment.utc().startOf("day").toDate();
  await repo.recordInteractions(answers.map((a) => ({ orgId, topic: a.topic, wasAnswered: a.answered, groundingType: a.grounding, createdAt: today })));
  return { answers, allAnswered: answers.every((a) => a.answered) };
}

// --- Knowledge articles (HR/Admin) ---

const cleanKeywords = (k: string[]) => [...new Set(k.map((w) => w.trim().toLowerCase()).filter(Boolean))];

async function requirePolicy(orgId: string, policyId: string | null | undefined, actor: AccessTokenPayload) {
  if (!policyId) return;
  if (!(await listPolicies(orgId, actor)).some((p) => p.id === policyId)) throw new DomainError("VALIDATION_ERROR", "Policy not found.", 400);
}

export function listArticles(orgId: string) {
  return repo.listArticles(orgId);
}

export async function getArticle(orgId: string, id: string) {
  const a = await repo.findArticle(orgId, id);
  if (!a) throw new DomainError("NOT_FOUND", "Article not found.", 404);
  return a;
}

export async function createArticle(orgId: string, input: { title: string; body: string; keywords: string[]; policyId?: string | null }, actor: AccessTokenPayload) {
  await requirePolicy(orgId, input.policyId, actor);
  return repo.createArticle({ orgId, title: input.title, body: input.body, keywords: cleanKeywords(input.keywords), policyId: input.policyId ?? null, createdById: actor.employeeId });
}

export async function updateArticle(orgId: string, id: string, input: { title?: string; body?: string; keywords?: string[]; policyId?: string | null }, actor: AccessTokenPayload) {
  await getArticle(orgId, id);
  await requirePolicy(orgId, input.policyId, actor);
  return repo.updateArticle(id, { ...input, ...(input.keywords ? { keywords: cleanKeywords(input.keywords) } : {}) });
}

export async function deleteArticle(orgId: string, id: string) {
  await getArticle(orgId, id);
  await repo.deleteArticle(id);
  return { id, deleted: true };
}

// --- Overview (FR-007, FR-008, SC-004) ---

export async function overview(orgId: string, range: { from?: string; to?: string }) {
  const to = range.to ? moment.utc(range.to).endOf("day").toDate() : moment.utc().endOf("day").toDate();
  const from = range.from ? moment.utc(range.from).startOf("day").toDate() : moment.utc(to).subtract(29, "days").startOf("day").toDate();
  const rows = await repo.listInteractions(orgId, from, to);
  const byTopic = new Map<string, { topic: string; questions: number; unanswered: number }>();
  for (const r of rows) {
    const t = byTopic.get(r.topic) ?? { topic: r.topic, questions: 0, unanswered: 0 };
    t.questions += 1;
    if (!r.wasAnswered) t.unanswered += 1;
    byTopic.set(r.topic, t);
  }
  const unanswered = rows.filter((r) => !r.wasAnswered).length;
  return {
    from: day(from),
    to: day(to),
    questions: rows.length,
    answered: rows.length - unanswered,
    unanswered,
    unansweredRate: rows.length ? Math.round((unanswered / rows.length) * 1000) / 1000 : 0,
    topics: [...byTopic.values()].sort((a, b) => b.questions - a.questions || a.topic.localeCompare(b.topic)),
  };
}
