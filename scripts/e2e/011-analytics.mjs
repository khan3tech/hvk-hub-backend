// specs/011-hr-analytics-reporting/quickstart.md, API side — dashboards reconcile with records.
import { call, check, show, API, future, RUN } from "./lib.mjs";

const today = new Date().toISOString().slice(0, 10);
const monthStart = today.slice(0, 8) + "01";

export default async function ({ tok, hire, department }) {
  // US1 — headcount
  const h1 = await call("GET", "/analytics/headcount", { token: tok.hr });
  const sum = (rows) => rows.reduce((s, r) => s + r.count, 0);
  check("011 headcount total = sum of department buckets = sum of designation buckets (FR-001, SC-004)", h1.status === 200 && sum(h1.json.byDepartment) === h1.json.total && sum(h1.json.byDesignation) === h1.json.total, show(h1));
  const dept = await department(`Analytics ${RUN}`);
  const joiner = await hire(`AnJoin ${RUN}`, "EMPLOYEE", { departmentId: dept.id, dateOfJoining: today });
  const h2 = await call("GET", "/analytics/headcount", { token: tok.hr });
  check("011 a new hire shows up in total and its department", h2.json.total === h1.json.total + 1 && h2.json.byDepartment.find((d) => d.id === dept.id)?.count === 1, show(h2));
  const thisMonth = h2.json.trend.at(-1);
  check("011 trend's current month counts the join (FR-002)", thisMonth.joins >= 1 && thisMonth.headcount === h2.json.total, JSON.stringify(thisMonth));

  // US2 — attrition: offboard in this department
  const leaver = await hire(`AnLeave ${RUN}`, "EMPLOYEE", { departmentId: dept.id, dateOfJoining: "2025-01-01" });
  await call("POST", `/employees/${leaver.id}/offboard`, { token: tok.hr });
  const h3 = await call("GET", "/analytics/headcount", { token: tok.hr });
  check("011 offboarded employee excluded from current headcount", h3.json.total === h2.json.total && h3.json.byDepartment.find((d) => d.id === dept.id)?.count === 1, show(h3));
  const att = await call("GET", `/analytics/attrition?from=${monthStart}&to=${today}`, { token: tok.hr });
  const deptRow = att.json.byDepartment?.find((d) => d.id === dept.id);
  check("011 attrition counts the exit for its department (FR-003)", att.json.exits >= 1 && deptRow?.exits === 1, show(att));
  const expectedRate = Math.round((deptRow.exits / deptRow.averageHeadcount) * 10000) / 100;
  check("011 department attrition rate = exits / average headcount", deptRow.ratePercent === expectedRate, JSON.stringify(deptRow));
  check("011 average tenure reported for active workforce (FR-004)", att.json.tenure?.employees > 0 && att.json.tenure.averageDays > 0, JSON.stringify(att.json.tenure));

  // US3 — leave usage
  const types = (await call("GET", "/leave-types", { token: tok.hr })).json;
  const before = await call("GET", `/analytics/leave-usage?from=${today}&to=${future(90)}&departmentId=${dept.id}`, { token: tok.hr });
  const lr = (await call("POST", "/leave-requests", { token: joiner.token, body: { leaveTypeId: types[0].id, startDate: future(60), endDate: future(60) } })).json;
  await call("POST", `/leave-requests/${lr.id}/approve`, { token: tok.hr });
  const after = await call("GET", `/analytics/leave-usage?from=${today}&to=${future(90)}&departmentId=${dept.id}`, { token: tok.hr });
  check("011 approved leave counted per type, filtered by department (FR-005)", after.json.totalDays === before.json.totalDays + lr.days && after.json.byLeaveType.some((t) => t.leaveTypeId === types[0].id), show(after));

  // US3 — payroll cost reconciles with payslips
  const cost = await call("GET", "/analytics/payroll-cost", { token: tok.hr });
  const p = cost.json.periods?.at(-1);
  const slips = p ? (await call("GET", `/payroll/payslips?periodMonth=${p.periodMonth}&periodYear=${p.periodYear}`, { token: tok.hr })).json : [];
  const net = Math.round(slips.reduce((s, x) => s + x.netPay, 0) * 100) / 100;
  check("011 payroll cost per period equals the sum of its payslips (FR-006/007)", p && p.netPay === net && p.payslipCount === slips.length, `${p?.netPay} vs ${net}`);

  // FR-009 / FR-010
  const mgr = await call("GET", "/analytics/headcount", { token: tok.manager });
  check("011 dashboards are HR/Admin only (FR-009)", mgr.status === 403, show(mgr));
  const res = await fetch(`${API}/analytics/attrition?format=csv&from=${monthStart}&to=${today}`, { headers: { authorization: `Bearer ${tok.hr}` } });
  const csv = await res.text();
  check("011 dashboards export as CSV (FR-010)", res.status === 200 && res.headers.get("content-type").startsWith("text/csv") && csv.startsWith("Department ID,Department,Exits"), csv.slice(0, 120));
}
