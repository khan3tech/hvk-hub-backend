// Business rules for the payroll module. Framework-agnostic — no req/res.
// Calls repository.ts for persistence; never imports Prisma directly.
// Implements the functional requirements (FR-xxx) in specs/004-payroll/spec.md.
import moment from "moment";
import { DomainError } from "../../middleware/errorHandler.js";
import { getTeamView, getOffboardedDate, getEmployeeSummary } from "../employee/service.js";
import { notifyEmployees } from "../notifications/service.js";
import { getUnpaidLeaveDaysForPeriod } from "../attendance/service.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import type { SetSalaryStructureRequest, RunPayrollRequest } from "./schema.js";

// Org's single default currency for v0.1 (single-org, single-currency scope — see spec
// Assumptions). Set explicitly on every SalaryStructure/Payslip rather than left `null`, since
// 026-global-multi-currency-payroll's ReportingCurrencyConfig lookup isn't built yet; this is
// the fallback value that config would resolve to for this org anyway.
const DEFAULT_CURRENCY = "INR";

function startOfDay(date: moment.MomentInput): Date {
  return moment.utc(date).startOf("day").toDate();
}

function todayUtc(): Date {
  return moment.utc().startOf("day").toDate();
}

function periodBounds(periodMonth: number, periodYear: number): { periodStart: Date; periodEnd: Date } {
  const periodStart = moment.utc({ year: periodYear, month: periodMonth - 1, day: 1 }).startOf("day").toDate();
  const periodEnd = moment.utc(periodStart).endOf("month").startOf("day").toDate();
  return { periodStart, periodEnd };
}

// research.md R3: weekday-only (no holiday exclusion — proration is about employment presence,
// not leave charging, see research.md R3's note on why this differs from 003's leave math).
function countWeekdays(startDate: Date, endDate: Date): number {
  let count = 0;
  const cursor = moment.utc(startDate);
  const end = moment.utc(endDate);
  while (cursor.isSameOrBefore(end)) {
    const day = cursor.day(); // 0=Sun..6=Sat
    if (day !== 0 && day !== 6) count++;
    cursor.add(1, "day");
  }
  return count;
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

// --- Salary structures (User Story 1) ---

export async function setSalaryStructure(
  orgId: string,
  employeeId: string,
  input: SetSalaryStructureRequest,
  actor: AccessTokenPayload,
) {
  if (input.basic < 0 || input.hra < 0 || Object.values(input.allowances).some((v) => v < 0)) {
    throw new DomainError("VALIDATION_ERROR", "Salary amounts must not be negative.", 400, {
      basic: ["Must be non-negative."],
    });
  }

  // 015 FR-003: only for an employee of the caller's own organization.
  if (!(await getEmployeeSummary(orgId, employeeId))) {
    throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  }

  const structure = await repo.createSalaryStructure({
    orgId,
    employeeId,
    basic: input.basic,
    hra: input.hra,
    allowances: input.allowances,
    effectiveFrom: startOfDay(input.effectiveFrom),
    currency: DEFAULT_CURRENCY,
  });

  await logActivity({
    orgId,
    actorEmployeeId: actor.employeeId,
    action: "salary_structure.set",
    entity: "SalaryStructure",
    entityId: structure.id,
    after: { basic: input.basic, hra: input.hra, effectiveFrom: input.effectiveFrom },
  });

  return structure;
}

export async function getSalaryStructure(
  orgId: string,
  employeeId: string,
  asOfDate: string | undefined,
  requester: AccessTokenPayload,
) {
  const isPrivileged = requester.role === "ADMIN" || requester.role === "HR";
  if (!isPrivileged) {
    if (requester.role === "MANAGER" || employeeId !== requester.employeeId) {
      throw new DomainError(
        "FORBIDDEN",
        "You don't have permission to view this salary structure.",
        403,
      );
    }
  }

  const periodEndDate = asOfDate ? startOfDay(asOfDate) : todayUtc();
  const structure = await repo.findEffectiveSalaryStructure(orgId, employeeId, periodEndDate);
  if (!structure) {
    throw new DomainError("NOT_FOUND", "No salary structure found for this employee.", 404);
  }
  return structure;
}

// --- Payroll run (User Story 2) ---

// 010-statutory-payroll-tax plugs in here (registered in app.ts) so payroll never imports it.
export interface StatutoryLine {
  groupId: string;
  componentId: string;
  name: string;
  amount: number;
}
export type StatutoryCalculator = (input: {
  orgId: string;
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
  prorationRatio: number;
  earnings: Record<string, number>; // already prorated
  fullMonth: { basic: number; hra: number; gross: number }; // un-prorated monthly amounts
}) => Promise<StatutoryLine[]>;

let statutoryCalculator: StatutoryCalculator | null = null;

// 021: one-off earnings (e.g. referral bonuses) HR scheduled for a period. Each line becomes its
// own earning on the payslip (not prorated); markIncluded runs once the payslip is saved.
export interface OneOffEarning {
  id: string;
  label: string;
  amount: number;
}
export interface OneOffEarningsProvider {
  list(orgId: string, employeeId: string, periodMonth: number, periodYear: number): Promise<OneOffEarning[]>;
  markIncluded(orgId: string, ids: string[], periodMonth: number, periodYear: number): Promise<void>;
}
let oneOffProvider: OneOffEarningsProvider | null = null;

export function setOneOffEarningsProvider(provider: OneOffEarningsProvider | null): void {
  oneOffProvider = provider;
}

export function setStatutoryCalculator(calculator: StatutoryCalculator | null): void {
  statutoryCalculator = calculator;
}

interface PayslipComputation {
  earnings: Record<string, number>;
  deductions: Record<string, number>;
  statutoryDeductions: StatutoryLine[];
  netPay: number;
  oneOffIds: string[];
}

async function computePayslipForEmployee(
  orgId: string,
  employee: { id: string; dateOfJoining: Date; status: string },
  periodMonth: number,
  periodYear: number,
): Promise<PayslipComputation | { skipped: "NO_SALARY_STRUCTURE" }> {
  const { periodStart, periodEnd } = periodBounds(periodMonth, periodYear);

  const structure = await repo.findEffectiveSalaryStructure(orgId, employee.id, periodEnd);
  if (!structure) {
    return { skipped: "NO_SALARY_STRUCTURE" };
  }

  // research.md R3: clip the active range to joining/offboarding dates within the period.
  let activeStart = periodStart;
  let activeEnd = periodEnd;

  if (moment.utc(employee.dateOfJoining).isAfter(periodStart)) {
    activeStart = moment.utc(employee.dateOfJoining).isAfter(periodEnd) ? periodEnd : employee.dateOfJoining;
  }
  if (employee.status === "OFFBOARDED") {
    const offboardedDate = await getOffboardedDate(orgId, employee.id);
    if (offboardedDate && moment.utc(offboardedDate).isBefore(activeEnd)) {
      activeEnd = moment.utc(offboardedDate).isBefore(activeStart) ? activeStart : offboardedDate;
    }
  }

  const totalWeekdays = countWeekdays(periodStart, periodEnd);
  const activeWeekdays = moment.utc(activeStart).isAfter(activeEnd) ? 0 : countWeekdays(activeStart, activeEnd);
  const prorationRatio = totalWeekdays === 0 ? 0 : activeWeekdays / totalWeekdays;

  const allowances = structure.allowances as Record<string, number>;
  const earnings: Record<string, number> = {
    basic: structure.basic * prorationRatio,
    hra: structure.hra * prorationRatio,
  };
  for (const [name, amount] of Object.entries(allowances)) {
    earnings[name] = amount * prorationRatio;
  }

  const regularGross = Object.values(earnings).reduce((sum, v) => sum + v, 0);
  const dailyRate = totalWeekdays === 0 ? 0 : regularGross / (activeWeekdays || totalWeekdays);

  // 021 FR-008: one-off lines are added after proration and kept out of the daily rate.
  const oneOffs = oneOffProvider ? await oneOffProvider.list(orgId, employee.id, periodMonth, periodYear) : [];
  for (const o of oneOffs) earnings[o.label] = (earnings[o.label] ?? 0) + o.amount;
  const grossEarnings = regularGross + oneOffs.reduce((sum, o) => sum + o.amount, 0);

  // research.md R2: applied after proration, against the prorated gross's implied daily rate —
  // never double-counted against the full, un-prorated period.
  const unpaidDays = moment.utc(activeStart).isAfter(activeEnd)
    ? 0
    : await getUnpaidLeaveDaysForPeriod(orgId, employee.id, activeStart, activeEnd);
  const deductions: Record<string, number> = { unpaidLeave: unpaidDays * dailyRate };

  const fullMonthGross = structure.basic + structure.hra + Object.values(allowances).reduce((sum, v) => sum + v, 0);
  const statutoryDeductions = statutoryCalculator
    ? await statutoryCalculator({
        orgId,
        employeeId: employee.id,
        periodStart,
        periodEnd,
        prorationRatio,
        earnings,
        fullMonth: { basic: structure.basic, hra: structure.hra, gross: fullMonthGross },
      })
    : [];

  const totalDeductions =
    Object.values(deductions).reduce((sum, v) => sum + v, 0) +
    statutoryDeductions.reduce((sum, line) => sum + line.amount, 0);

  return { earnings, deductions, statutoryDeductions, netPay: grossEarnings - totalDeductions, oneOffIds: oneOffs.map((o) => o.id) };
}

export async function runPayroll(
  orgId: string,
  input: RunPayrollRequest,
  actor: AccessTokenPayload,
) {
  const { periodStart } = periodBounds(input.periodMonth, input.periodYear);
  const employees = await repo.findActiveEmployeesForPeriod(orgId, periodStart);

  const skipped: Array<{ employeeId: string; reason: string }> = [];
  let payslipCount = 0;

  for (const employee of employees) {
    const result = await computePayslipForEmployee(orgId, employee, input.periodMonth, input.periodYear);
    if ("skipped" in result) {
      skipped.push({ employeeId: employee.id, reason: result.skipped });
      continue;
    }

    await repo.upsertPayslip({
      orgId,
      employeeId: employee.id,
      periodMonth: input.periodMonth,
      periodYear: input.periodYear,
      data: {
        orgId,
        employeeId: employee.id,
        periodMonth: input.periodMonth,
        periodYear: input.periodYear,
        earnings: result.earnings,
        deductions: result.deductions,
        statutoryDeductions: result.statutoryDeductions as never,
        netPay: result.netPay,
        generatedAt: moment().toDate(),
        currency: DEFAULT_CURRENCY,
      },
    });
    if (oneOffProvider && result.oneOffIds.length > 0) {
      await oneOffProvider.markIncluded(orgId, result.oneOffIds, input.periodMonth, input.periodYear);
    }
    payslipCount++;
  }

  await logActivity({
    orgId,
    actorEmployeeId: actor.employeeId,
    action: "payroll.run",
    entity: "PayrollRun",
    entityId: `${input.periodYear}-${input.periodMonth}`,
    after: { periodMonth: input.periodMonth, periodYear: input.periodYear, payslipCount, skipped },
  });

  // 006 FR-003: one summary to the HR/Admin who ran it (never one per payslip — Assumptions).
  if (actor.employeeId) {
    const names = await Promise.all(
      skipped.map(async (s) => `${(await getEmployeeSummary(orgId, s.employeeId))?.name ?? s.employeeId} (${s.reason})`),
    );
    const period = `${input.periodYear}-${String(input.periodMonth).padStart(2, "0")}`;
    const message =
      `Payroll ${period} finished: ${payslipCount} payslip(s) generated` +
      (names.length ? `; ${names.length} skipped: ${names.join(", ")}.` : ", none skipped.");
    await notifyEmployees(orgId, [actor.employeeId], {
      type: "PAYROLL_RUN_COMPLETED",
      message,
      link: `/payroll/runs/${period}`,
      email: { subject: `Payroll ${period} completed`, text: message },
    });
  }

  return { periodMonth: input.periodMonth, periodYear: input.periodYear, payslipCount, skipped };
}

export async function getPayslipsOrgWide(
  orgId: string,
  filters: { employeeId?: string; periodMonth?: number; periodYear?: number },
) {
  return repo.findPayslipsOrgWide(orgId, filters);
}

// --- Self/team payslip access (User Story 3) ---

export async function getMyPayslips(orgId: string, employeeId: string) {
  return repo.findPayslipsForEmployee(orgId, employeeId);
}

export async function getMyPayslipById(orgId: string, employeeId: string, id: string) {
  const payslip = await repo.findPayslipById(orgId, id);
  if (!payslip) {
    throw new DomainError("NOT_FOUND", "Payslip not found.", 404);
  }
  if (payslip.employeeId !== employeeId) {
    throw new DomainError("FORBIDDEN", "You don't have permission to view this payslip.", 403);
  }
  return payslip;
}

export async function getTeamPayslips(
  orgId: string,
  requester: AccessTokenPayload,
  filters: { periodMonth?: number; periodYear?: number },
) {
  const { directReports } = await getTeamView(orgId, requester);
  const reportIds = directReports.map((r) => r.id);
  if (reportIds.length === 0) return [];
  return repo.findPayslipsForEmployees(orgId, reportIds, filters);
}

// 011 analytics FR-006/FR-007: per-period totals from the current payslips (a re-run period has
// already replaced its payslips, so totals are always the corrected ones).
export async function getPayrollCostByPeriod(orgId: string) {
  const payslips = await repo.findPayslipsOrgWide(orgId);
  const byPeriod = new Map<string, { periodYear: number; periodMonth: number; netPay: number; gross: number; statutory: number; payslipCount: number }>();
  for (const p of payslips) {
    const key = `${p.periodYear}-${String(p.periodMonth).padStart(2, "0")}`;
    const row = byPeriod.get(key) ?? { periodYear: p.periodYear, periodMonth: p.periodMonth, netPay: 0, gross: 0, statutory: 0, payslipCount: 0 };
    row.netPay += p.netPay;
    row.gross += Object.values(p.earnings as Record<string, number>).reduce((s, v) => s + v, 0);
    row.statutory += ((p.statutoryDeductions as Array<{ amount: number }> | null) ?? []).reduce((s, l) => s + l.amount, 0);
    row.payslipCount += 1;
    byPeriod.set(key, row);
  }
  return [...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, r]) => ({ period, ...r }));
}
