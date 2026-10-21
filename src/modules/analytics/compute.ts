// Pure aggregation math for HR analytics (specs/011-hr-analytics-reporting) — no I/O, so every
// figure is unit-tested against a manual calculation (SC-002).
import moment from "moment";

export interface EmployeeFact {
  id: string;
  departmentId: string | null;
  designationId: string | null;
  dateOfJoining: Date;
  status: string;
  offboardedAt: Date | null;
}

export const UNASSIGNED = "unassigned";
const DAY_MS = 86_400_000;

// Employed on `at`: joined on or before it, and not yet offboarded by then. An offboarded record
// without a known offboarding date is treated as gone (never silently counted as active).
export function isEmployedOn(e: EmployeeFact, at: Date): boolean {
  if (e.dateOfJoining > at) return false;
  if (e.status !== "OFFBOARDED") return true;
  return e.offboardedAt !== null && e.offboardedAt > at;
}

export function headcountOn(employees: EmployeeFact[], at: Date): number {
  return employees.filter((e) => isEmployedOn(e, at)).length;
}

// FR-008: null keys become an explicit "unassigned" bucket.
export function breakdown(employees: EmployeeFact[], key: "departmentId" | "designationId") {
  const counts = new Map<string, number>();
  for (const e of employees) {
    const k = e[key] ?? UNASSIGNED;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

// FR-002: month-end headcount plus joins/exits per month across [from, to].
export function monthlyTrend(employees: EmployeeFact[], from: Date, to: Date) {
  const rows = [];
  const cursor = moment.utc(from).startOf("month");
  const last = moment.utc(to).startOf("month");
  while (cursor.isSameOrBefore(last)) {
    const start = cursor.clone().toDate();
    const end = cursor.clone().endOf("month").toDate();
    const atEnd = end > to ? to : end;
    rows.push({
      month: cursor.format("YYYY-MM"),
      headcount: headcountOn(employees, atEnd),
      joins: employees.filter((e) => e.dateOfJoining >= start && e.dateOfJoining <= atEnd).length,
      exits: employees.filter((e) => e.offboardedAt && e.offboardedAt >= start && e.offboardedAt <= atEnd).length,
    });
    cursor.add(1, "month");
  }
  return rows;
}

// FR-003: exits in [from, to] ÷ average of the opening and closing headcount, as a percentage.
export function attrition(employees: EmployeeFact[], from: Date, to: Date) {
  const exits = employees.filter((e) => e.offboardedAt && e.offboardedAt >= from && e.offboardedAt <= to).length;
  const openingDay = new Date(from.getTime() - 1);
  const averageHeadcount = (headcountOn(employees, openingDay) + headcountOn(employees, to)) / 2;
  const rate = averageHeadcount === 0 ? 0 : Math.round((exits / averageHeadcount) * 10000) / 100;
  return { exits, averageHeadcount, ratePercent: rate };
}

// FR-004: average tenure of the current active workforce (already joined), in days and years.
export function averageTenure(employees: EmployeeFact[], now: Date) {
  const active = employees.filter((e) => e.status === "ACTIVE" && e.dateOfJoining <= now);
  if (active.length === 0) return { employees: 0, averageDays: 0, averageYears: 0 };
  const days = active.reduce((s, e) => s + Math.floor((now.getTime() - e.dateOfJoining.getTime()) / DAY_MS), 0) / active.length;
  return { employees: active.length, averageDays: Math.round(days * 10) / 10, averageYears: Math.round((days / 365.25) * 100) / 100 };
}

// FR-010: RFC 4180-ish CSV with spreadsheet formula-injection neutralised.
export function toCsv(header: string[], rows: Array<Array<string | number | null>>): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    const safe = typeof v === "string" && /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}
