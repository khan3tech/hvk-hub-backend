// Question understanding for the HR assistant (specs/027-hr-assistant-chatbot). Pure functions:
// they decide *what* is being asked; service.ts answers only from real records (FR-002, FR-005).
// The classifier sits behind an interface so a language-model classifier can replace it later
// without touching grounding or RBAC.

export type Intent =
  | "LEAVE_BALANCE"
  | "LEAVE_ENTITLEMENT"
  | "HOLIDAYS"
  | "PAYSLIP"
  | "EXPENSE_STATUS"
  | "TICKET_STATUS"
  | "POLICY"; // anything else: looked up in HR's knowledge articles

export interface IntentClassifier {
  classify(part: string): Intent;
}

const has = (text: string, ...patterns: RegExp[]) => patterns.some((p) => p.test(text));

const LEAVE = /\b(leaves?|day off|days off|time off|vacation|pto|sick|casual|annual|earned|privilege)\b/;
const PERSONAL = /\b(left|remaining|balance|available|i have|do i have|have i|my|mine|used)\b/;

export const keywordClassifier: IntentClassifier = {
  classify(part) {
    const t = part.toLowerCase();
    if (has(t, /\bholidays?\b/, /\bpublic holiday/)) return "HOLIDAYS";
    if (has(t, /\bpay ?slips?\b/, /\bsalary\b/, /\bnet pay\b/, /\bpaycheck\b/, /\bdeductions?\b/, /\btake[- ]home\b/, /\bwas i paid\b/)) return "PAYSLIP";
    if (has(t, /\bexpenses?\b/, /\bclaims?\b/, /\breimburse/)) return "EXPENSE_STATUS";
    if (has(t, /\btickets?\b/, /\bhelpdesk\b/, /\bhelp desk\b/)) return "TICKET_STATUS";
    if (LEAVE.test(t)) {
      if (PERSONAL.test(t)) return "LEAVE_BALANCE";
      if (has(t, /\bper year\b/, /\bentitle/, /\ballowance\b/, /\bdo we get\b/, /\bhow many\b/, /\bpolicy\b/, /\btypes?\b/)) return "LEAVE_ENTITLEMENT";
    }
    return "POLICY";
  },
};

// FR-010: "what's my leave balance and what's our stance on remote work" → two parts.
export function splitQuestion(question: string): string[] {
  return question
    .split(/[?;\n]+|\.\s+|\s+(?:and also|also|and|plus)\s+(?=(?:what|how|when|where|who|which|is|are|can|do|does|did|was|my|our|tell|explain|show)\b)/i)
    .map((p) => p.trim().replace(/^[,.\s]+|[,.\s]+$/g, ""))
    .filter((p) => p.length >= 3)
    .slice(0, 5);
}

const NOT_PEOPLE = new Set([
  "my", "i", "it", "that", "this", "what", "who", "today", "company", "companys", "team", "teams", "month", "year", "week",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "last", "next", "this", "everyone", "anyone",
]);

// FR-003/US1.3: personal-data questions about somebody other than the asker are refused outright
// (the data lookups only ever read the asker's own records anyway).
export function mentionsSomeoneElse(part: string): boolean {
  if (/\b(someone else|somebody else|colleague|co-?worker|his|her|their|my manager|my boss|my team|my reports?|other employees?|everyone)\b/i.test(part)) return true;
  for (const m of part.matchAll(/\b([A-Za-z]+)['’]s\b/g)) {
    if (!NOT_PEOPLE.has(m[1]!.toLowerCase())) return true;
  }
  for (const m of part.matchAll(/\b(?:of|for)\s+([A-Z][a-z]+)\b/g)) {
    if (!NOT_PEOPLE.has(m[1]!.toLowerCase())) return true;
  }
  return false;
}

// FR-007: coarse, non-identifying topic labels for HR's overview — even for questions the
// assistant couldn't answer, so missing documentation shows up as a topic.
const VOCABULARY: Array<[string, RegExp]> = [
  ["remote work", /\b(remote|work from home|wfh|hybrid)\b/],
  ["parental leave", /\b(parental|maternity|paternity|adoption)\b/],
  ["notice period", /\b(notice period|resign|resignation|quit)\b/],
  ["benefits", /\b(benefits?|insurance|medical|health ?care|pension|gratuity)\b/],
  ["compensation", /\b(bonus|increment|raise|hike|appraisal|promotion)\b/],
  ["working hours", /\b(working hours|overtime|shift|timings?)\b/],
  ["travel", /\b(travel|relocation|per diem)\b/],
  ["conduct", /\b(harass|conduct|dress code|grievance|ethics)\b/],
  ["training", /\b(training|course|learning|certification)\b/],
  ["equipment", /\b(laptop|equipment|asset|device)\b/],
];

export function topicOf(part: string, intent: Intent): string {
  if (intent !== "POLICY") return intent.toLowerCase().replace(/_/g, " ");
  const t = part.toLowerCase();
  return VOCABULARY.find(([, re]) => re.test(t))?.[0] ?? "other";
}

const STOP = new Set(["the", "a", "an", "is", "are", "what", "whats", "how", "do", "does", "we", "our", "i", "my", "to", "of", "for", "in", "on", "about", "can", "with", "and", "or", "it", "be", "there", "any", "tell", "me", "please", "policy", "company"]);

export function terms(text: string): string[] {
  return [...new Set(text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))];
}

// FR-004/FR-005: an article qualifies only on a real overlap — one of its HR-chosen keywords
// (single word or phrase) appears in the question, or two distinct title words do.
export function articleScore(question: string, article: { title: string; keywords: string[] }): number {
  const q = ` ${question.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ")} `;
  const keywordHits = article.keywords.filter((k) => k.trim() && q.includes(` ${k.toLowerCase().trim()} `)).length;
  const qTerms = new Set(terms(question));
  const titleHits = terms(article.title).filter((w) => qTerms.has(w)).length;
  return keywordHits * 2 + (titleHits >= 2 ? titleHits : 0);
}
