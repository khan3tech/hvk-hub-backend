// HR analytics: read-only aggregation over 002/003/004 data via their services (Principle I).
// Implements specs/011-hr-analytics-reporting/spec.md. No data of its own.
import moment from "moment";
import { DomainError } from "../../middleware/errorHandler.js";
import { listDepartments, listDesignations, listEmployeesForAnalytics } from "../employee/service.js";
import { listApprovedLeaveForAnalytics, listLeaveTypes } from "../attendance/service.js";
import { getPayrollCostByPeriod } from "../payroll/service.js";
import { UNASSIGNED, attrition, averageTenure, breakdown, headcountOn, isEmployedOn, monthlyTrend, toCsv } from "./compute.js";

const TREND_NOTE = "Trend context builds up as more history accumulates.";

function range(from?: string, to?: string, defaultMonths = 12) {
  const end = to ? moment.utc(to).endOf("day") : moment.utc().endOf("day");
  const start = from ? moment.utc(from).startOf("day") : end.clone().subtract(defaultMonths - 1, "months").startOf("month");
  if (!start.isValid() || !end.isValid() || start.isAfter(end)) {
    throw new DomainError("VALIDATION_ERROR", "Provide a valid from/to date range (YYYY-MM-DD).", 400, { from: ["Invalid range."] });
  }
  return { from: start.toDate(), to: end.toDate() };
}

async function nameMaps(orgId: string) {
  const [departments, designations] = await Promise.all([listDepartments(orgId), listDesignations(orgId)]);
  return {
    department: new Map<string, string>([[UNASSIGNED, "Unassigned"], ...departments.map((d) => [d.id, d.name] as [string, string])]),
    designation: new Map<string, string>([[UNASSIGNED, "Unassigned"], ...designations.map((d) => [d.id, d.title] as [string, string])]),
  };
}

const named = (counts: Map<string, number>, names: Map<string, string>) =>
  [...counts.entries()].map(([id, count]) => ({ id, name: names.get(id) ?? id, count })).sort((a, b) => b.count - a.count);

// US1 — FR-001/002/008
export async function headcount(orgId: string, q: { from?: string; to?: string }) {
  const { from, to } = range(q.from, q.to);
  const now = new Date();
  const [employees, names] = await Promise.all([listEmployeesForAnalytics(orgId), nameMaps(orgId)]);
  // Same definition as the total, so the breakdowns always sum to it (future joiners excluded).
  const current = employees.filter((e) => isEmployedOn(e, now));
  const trend = monthlyTrend(employees, from, to);
  return {
    asOf: now.toISOString(),
    total: headcountOn(employees, now),
    byDepartment: named(breakdown(current, "departmentId"), names.department),
    byDesignation: named(breakdown(current, "designationId"), names.designation),
    trend,
    ...(trend.length < 2 ? { note: TREND_NOTE } : {}),
  };
}

// US2 — FR-003/004
export async function attritionReport(orgId: string, q: { from?: string; to?: string }) {
  const { from, to } = range(q.from, q.to);
  const [employees, names] = await Promise.all([listEmployeesForAnalytics(orgId), nameMaps(orgId)]);
  const departments = new Set(employees.map((e) => e.departmentId ?? UNASSIGNED));
  const byDepartment = [...departments]
    .map((id) => ({ id, name: names.department.get(id) ?? id, ...attrition(employees.filter((e) => (e.departmentId ?? UNASSIGNED) === id), from, to) }))
    .filter((d) => d.exits > 0 || d.averageHeadcount > 0)
    .sort((a, b) => b.exits - a.exits);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    ...attrition(employees, from, to),
    byDepartment,
    tenure: averageTenure(employees, new Date()),
  };
}

// US3 — FR-005: approved leave days per type (by the period the leave starts in), per department.
export async function leaveUsage(orgId: string, q: { from?: string; to?: string; departmentId?: string }) {
  const { from, to } = range(q.from, q.to);
  const [leave, types, employees] = await Promise.all([
    listApprovedLeaveForAnalytics(orgId, from, to),
    listLeaveTypes(orgId),
    listEmployeesForAnalytics(orgId),
  ]);
  const dept = new Map(employees.map((e) => [e.id, e.departmentId ?? UNASSIGNED]));
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const rows = new Map<string, { leaveTypeId: string; name: string; days: number; requests: number }>();
  for (const l of leave) {
    if (q.departmentId && dept.get(l.employeeId) !== q.departmentId) continue;
    const row = rows.get(l.leaveTypeId) ?? { leaveTypeId: l.leaveTypeId, name: typeName.get(l.leaveTypeId) ?? l.leaveTypeId, days: 0, requests: 0 };
    row.days += l.days;
    row.requests += 1;
    rows.set(l.leaveTypeId, row);
  }
  const byLeaveType = [...rows.values()].sort((a, b) => b.days - a.days);
  return { from: from.toISOString(), to: to.toISOString(), departmentId: q.departmentId ?? null, totalDays: byLeaveType.reduce((s, r) => s + r.days, 0), byLeaveType };
}

// US3 — FR-006/007
export async function payrollCost(orgId: string, q: { from?: string; to?: string }) {
  const all = await getPayrollCostByPeriod(orgId);
  const periods = all
    .filter((p) => (!q.from || p.period >= q.from.slice(0, 7)) && (!q.to || p.period <= q.to.slice(0, 7)))
    .map((p) => ({ ...p, netPay: Math.round(p.netPay * 100) / 100, gross: Math.round(p.gross * 100) / 100, statutory: Math.round(p.statutory * 100) / 100 }));
  return { periods, ...(periods.length < 2 ? { note: TREND_NOTE } : {}) };
}

// FR-010: each dashboard's underlying table as CSV.
export function asCsv(dashboard: string, data: Record<string, unknown>): { filename: string; csv: string } {
  const d = data as never as Record<string, Array<Record<string, string | number | null>>>;
  switch (dashboard) {
    case "headcount":
      return {
        filename: "headcount.csv",
        csv: toCsv(["Section", "Key", "Name", "Count", "Joins", "Exits"], [
          ...d.byDepartment!.map((r) => ["DEPARTMENT", r.id!, r.name!, r.count!, null, null]),
          ...d.byDesignation!.map((r) => ["DESIGNATION", r.id!, r.name!, r.count!, null, null]),
          ...d.trend!.map((r) => ["TREND", r.month!, null, r.headcount!, r.joins!, r.exits!]),
        ]),
      };
    case "attrition":
      return {
        filename: "attrition.csv",
        csv: toCsv(["Department ID", "Department", "Exits", "Average Headcount", "Attrition %"], [
          ["ALL", "All", data.exits as number, data.averageHeadcount as number, data.ratePercent as number],
          ...d.byDepartment!.map((r) => [r.id!, r.name!, r.exits!, r.averageHeadcount!, r.ratePercent!]),
        ]),
      };
    case "leave-usage":
      return {
        filename: "leave-usage.csv",
        csv: toCsv(["Leave Type ID", "Leave Type", "Days", "Requests"], d.byLeaveType!.map((r) => [r.leaveTypeId!, r.name!, r.days!, r.requests!])),
      };
    default:
      return {
        filename: "payroll-cost.csv",
        csv: toCsv(["Period", "Payslips", "Gross", "Statutory", "Net Pay"], d.periods!.map((r) => [r.period!, r.payslipCount!, r.gross!, r.statutory!, r.netPay!])),
      };
  }
}
