// Business rules for statutory deductions and compliance reports. Framework-agnostic.
// Implements specs/010-statutory-payroll-tax/spec.md.
import { randomUUID } from "node:crypto";
import moment from "moment";
import { Prisma } from "@prisma/client";
import { DomainError } from "../../middleware/errorHandler.js";
import { getEmployeeSummary } from "../employee/service.js";
import { getPayslipsOrgWide, type StatutoryCalculator, type StatutoryLine } from "../payroll/service.js";
import { computeStatutoryAmount } from "./calculate.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import type { CreateComponentRequest, CreateVersionRequest, Rule } from "./schema.js";

type Version = Awaited<ReturnType<typeof repo.listVersions>>[number];

const day = (d: Date) => moment.utc(d).format("YYYY-MM-DD");

async function audit(orgId: string, actor: AccessTokenPayload, action: string, entity: string, entityId: string, after?: unknown) {
  if (!actor.employeeId) return;
  await repo.writeActivityLog({ orgId, actorId: actor.employeeId, action, entity, entityId, after });
}

function present(v: Version) {
  return { ...v, effectiveFrom: day(v.effectiveFrom) };
}

// research.md R2: the version in effect on `asOf` is the latest effectiveFrom <= asOf (ties: the
// most recently created). Discontinued (active=false) groups drop out.
export function versionsInEffect(versions: Version[], asOf: Date): Version[] {
  const byGroup = new Map<string, Version>();
  for (const v of versions) {
    if (v.effectiveFrom > asOf) continue;
    const current = byGroup.get(v.groupId);
    if (!current || v.effectiveFrom > current.effectiveFrom || (+v.effectiveFrom === +current.effectiveFrom && v.createdAt >= current.createdAt)) {
      byGroup.set(v.groupId, v);
    }
  }
  return [...byGroup.values()].filter((v) => v.active);
}

// --- Components (US1) ---

export async function createComponent(orgId: string, input: CreateComponentRequest, actor: AccessTokenPayload) {
  const version = await repo.createVersion({
    orgId,
    groupId: randomUUID(),
    name: input.name,
    ruleType: input.ruleType,
    ruleConfig: input.ruleConfig as Prisma.InputJsonValue,
    country: input.country ?? null,
    effectiveFrom: moment.utc(input.effectiveFrom).toDate(),
    createdById: actor.employeeId,
  });
  await audit(orgId, actor, "statutory.component_created", "StatutoryComponent", version.groupId, { name: input.name, ruleType: input.ruleType, effectiveFrom: input.effectiveFrom });
  return present(version);
}

// FR-002: never edits a version in place — adds a new one effective from a date.
export async function createVersion(orgId: string, groupId: string, input: CreateVersionRequest, actor: AccessTokenPayload) {
  const versions = await repo.listVersions(orgId, { groupId });
  const latest = versions.at(-1);
  if (!latest) throw new DomainError("NOT_FOUND", "Statutory component not found.", 404);

  const rule: Rule | null = "ruleType" in input ? ({ ruleType: input.ruleType, ruleConfig: input.ruleConfig } as Rule) : null;
  const version = await repo.createVersion({
    orgId,
    groupId,
    name: ("name" in input && input.name) || latest.name,
    ruleType: rule?.ruleType ?? latest.ruleType,
    ruleConfig: (rule?.ruleConfig ?? latest.ruleConfig) as Prisma.InputJsonValue,
    country: latest.country,
    effectiveFrom: moment.utc(input.effectiveFrom).toDate(),
    active: rule !== null,
    createdById: actor.employeeId,
  });
  await audit(orgId, actor, rule ? "statutory.version_created" : "statutory.component_discontinued", "StatutoryComponent", groupId, { effectiveFrom: input.effectiveFrom });
  return present(version);
}

// One row per component: the version in effect today, plus the full history.
export async function listComponents(orgId: string, asOf: Date = new Date()) {
  const versions = await repo.listVersions(orgId);
  const groups = new Map<string, Version[]>();
  for (const v of versions) groups.set(v.groupId, [...(groups.get(v.groupId) ?? []), v]);
  return [...groups.entries()].map(([groupId, history]) => {
    const current = versionsInEffect(history, asOf)[0] ?? null;
    return {
      groupId,
      name: history.at(-1)!.name,
      current: current ? present(current) : null,
      versions: history.map(present),
    };
  });
}

// --- Exemptions (FR-003) ---

export async function createExemption(orgId: string, input: { employeeId: string; groupId: string; reason?: string }, actor: AccessTokenPayload) {
  const [employee, root] = await Promise.all([getEmployeeSummary(orgId, input.employeeId), repo.findGroupRoot(orgId, input.groupId)]);
  if (!employee) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  if (!root) throw new DomainError("NOT_FOUND", "Statutory component not found.", 404);
  try {
    const exemption = await repo.createExemption({
      orgId,
      employeeId: employee.id,
      statutoryComponentId: root.id,
      groupId: input.groupId,
      reason: input.reason,
    });
    await audit(orgId, actor, "statutory.exemption_created", "StatutoryExemption", exemption.id, { employeeId: employee.id, groupId: input.groupId });
    return exemption;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DomainError("EXEMPTION_EXISTS", "This employee is already exempt from that component.", 409);
    }
    throw err;
  }
}

export async function listExemptions(orgId: string, filters: { employeeId?: string; groupId?: string }) {
  return repo.listExemptions(orgId, {
    ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
    ...(filters.groupId ? { groupId: filters.groupId } : {}),
  });
}

export async function removeExemption(orgId: string, id: string, actor: AccessTokenPayload) {
  const exemption = await repo.findExemption(orgId, id);
  if (!exemption) throw new DomainError("NOT_FOUND", "Exemption not found.", 404);
  await repo.deleteExemption(id);
  await audit(orgId, actor, "statutory.exemption_removed", "StatutoryExemption", id, { employeeId: exemption.employeeId, groupId: exemption.groupId });
}

// --- Payroll integration (US2) — registered with payroll.setStatutoryCalculator() in app.ts ---

// FR-004/FR-010: rules in effect at period end, minus the employee's exemptions, on prorated pay.
export const calculateStatutory: StatutoryCalculator = async (input) => {
  const [versions, exemptions] = await Promise.all([
    repo.listVersions(input.orgId, { effectiveFrom: { lte: input.periodEnd } }),
    repo.listExemptions(input.orgId, { employeeId: input.employeeId }),
  ]);
  const exempt = new Set(exemptions.map((e) => e.groupId));
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const prorated = { basic: input.earnings.basic ?? 0, hra: input.earnings.hra ?? 0, gross: sum(input.earnings) };

  const lines: StatutoryLine[] = [];
  for (const v of versionsInEffect(versions, input.periodEnd)) {
    if (exempt.has(v.groupId)) continue;
    const amount = computeStatutoryAmount({ ruleType: v.ruleType, ruleConfig: v.ruleConfig } as Rule, {
      prorated,
      fullMonth: input.fullMonth,
      prorationRatio: input.prorationRatio,
    });
    if (amount > 0) lines.push({ groupId: v.groupId, componentId: v.id, name: v.name, amount });
  }
  return lines;
};

// --- Compliance reports (US3) ---

type ReportLine = { employeeId: string; groupId: string; name: string; amount: number };

// FR-006/FR-008/SC-003: totals are summed from the period's current payslips, so a re-run period
// regenerates with corrected figures. Each generation is stored, newest first.
export async function generateReport(orgId: string, periodMonth: number, periodYear: number, actor: AccessTokenPayload) {
  const payslips = await getPayslipsOrgWide(orgId, { periodMonth, periodYear });
  if (payslips.length === 0) {
    throw new DomainError("NO_PAYROLL_FOR_PERIOD", "Run payroll for this period before generating its compliance report.", 404);
  }
  const lines: ReportLine[] = [];
  for (const p of payslips) {
    for (const l of (p.statutoryDeductions as StatutoryLine[] | null) ?? []) {
      lines.push({ employeeId: p.employeeId, groupId: l.groupId, name: l.name, amount: l.amount });
    }
  }
  const byGroup = new Map<string, { groupId: string; name: string; totalWithheld: number; employees: Set<string> }>();
  for (const l of lines) {
    const g = byGroup.get(l.groupId) ?? { groupId: l.groupId, name: l.name, totalWithheld: 0, employees: new Set() };
    g.totalWithheld += l.amount;
    g.employees.add(l.employeeId);
    byGroup.set(l.groupId, g);
  }
  const components = [...byGroup.values()].map((g) => ({
    groupId: g.groupId,
    name: g.name,
    totalWithheld: Math.round(g.totalWithheld * 100) / 100,
    employeeCount: g.employees.size,
  }));
  const totals = {
    components,
    grandTotal: Math.round(components.reduce((s, c) => s + c.totalWithheld, 0) * 100) / 100,
    payslipCount: payslips.length,
    lines,
  };
  const report = await repo.createReport({ orgId, periodMonth, periodYear, totals: totals as Prisma.InputJsonValue, generatedById: actor.employeeId });
  await audit(orgId, actor, "statutory.report_generated", "ComplianceReport", report.id, { periodMonth, periodYear, grandTotal: totals.grandTotal });
  return presentReport(report);
}

function presentReport(report: NonNullable<Awaited<ReturnType<typeof repo.findReport>>>) {
  const { lines: _lines, ...summary } = report.totals as { lines: ReportLine[] };
  return { ...report, totals: summary };
}

export async function listReports(orgId: string, filters: { periodMonth?: number; periodYear?: number }) {
  const reports = await repo.listReports(orgId, {
    ...(filters.periodMonth ? { periodMonth: filters.periodMonth } : {}),
    ...(filters.periodYear ? { periodYear: filters.periodYear } : {}),
  });
  return reports.map(presentReport);
}

export async function getReport(orgId: string, id: string) {
  const report = await repo.findReport(orgId, id);
  if (!report) throw new DomainError("NOT_FOUND", "Compliance report not found.", 404);
  return presentReport(report);
}

const csvCell = (v: string | number) => {
  const s = String(v);
  // Quote everything with separators/quotes; neutralise spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) && typeof v === "string" ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

// FR-007: a CSV an accountant can open — component totals, then each employee's lines.
export async function exportReportCsv(orgId: string, id: string) {
  const report = await repo.findReport(orgId, id);
  if (!report) throw new DomainError("NOT_FOUND", "Compliance report not found.", 404);
  const totals = report.totals as { components: Array<{ name: string; totalWithheld: number; employeeCount: number }>; grandTotal: number; lines: ReportLine[] };
  const period = `${report.periodYear}-${String(report.periodMonth).padStart(2, "0")}`;
  const rows: Array<Array<string | number>> = [["Section", "Period", "Component", "Employee ID", "Employee Name", "Employees", "Amount"]];
  for (const c of totals.components) rows.push(["TOTAL", period, c.name, "", "", c.employeeCount, c.totalWithheld.toFixed(2)]);
  rows.push(["GRAND_TOTAL", period, "", "", "", "", totals.grandTotal.toFixed(2)]);
  const names = new Map<string, string>();
  for (const l of totals.lines) {
    if (!names.has(l.employeeId)) names.set(l.employeeId, (await getEmployeeSummary(orgId, l.employeeId))?.name ?? "");
    rows.push(["EMPLOYEE", period, l.name, l.employeeId, names.get(l.employeeId)!, "", l.amount.toFixed(2)]);
  }
  return { filename: `compliance-${period}.csv`, csv: rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n" };
}
