// Pure date helpers for 028-time-tracker (research.md R1/R2/R5). Calendar dates are the org's
// local date, represented as "YYYY-MM-DD" strings in the API and as UTC-midnight Date values
// in Postgres `@db.Date` columns.

// R1: one org time zone for this version; swap for a per-org setting later.
export const ORG_TIME_ZONE = "Asia/Kolkata";
export const DAY_MS = 86_400_000;
export const FLAG_AFTER_MINUTES = 12 * 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// The org-local calendar date of an instant, as "YYYY-MM-DD".
export function localDate(instant: Date, timeZone = ORG_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

// "YYYY-MM-DD" → the UTC-midnight Date Prisma stores for a @db.Date column.
export function toDbDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromDbDate(new Date(toDbDate(date).getTime() + days * DAY_MS));
}

// R2: the Monday of the ISO week containing `date`.
export function weekStartOf(date: string): string {
  const day = toDbDate(date).getUTCDay(); // 0 = Sunday
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(date, offset);
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toDbDate(to).getTime() - toDbDate(from).getTime()) / DAY_MS);
}

// R5: elapsed time rounded to the nearest minute, at least 1.
export function elapsedMinutes(startedAt: Date, stoppedAt: Date): number {
  return Math.max(1, Math.round((stoppedAt.getTime() - startedAt.getTime()) / 60_000));
}

// R5 / FR-011: a timer that crossed the org-local midnight or ran over 12 hours.
export function isFlaggedTimer(startedAt: Date, stoppedAt: Date, timeZone = ORG_TIME_ZONE): boolean {
  return localDate(startedAt, timeZone) !== localDate(stoppedAt, timeZone) || elapsedMinutes(startedAt, stoppedAt) > FLAG_AFTER_MINUTES;
}
