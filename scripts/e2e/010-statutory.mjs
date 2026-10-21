// specs/010-statutory-payroll-tax/quickstart.md, API side. Amounts checked against hand math.
import { call, check, show, API, RUN } from "./lib.mjs";

export default async function ({ tok, hire }) {
  const a = await hire(`TaxA ${RUN}`);
  const b = await hire(`TaxB ${RUN}`);
  for (const e of [a, b]) {
    await call("POST", `/payroll/salary-structures/${e.id}`, { token: tok.hr, body: { basic: 50000, hra: 20000, allowances: { special: 10000 }, effectiveFrom: "2020-01-01" } });
  }
  const Y = 2040 + (parseInt(RUN, 36) % 50); // a fresh year per run keeps periods independent

  // US1 — configure
  const pt = await call("POST", "/statutory/components", { token: tok.hr, body: { name: `Professional tax ${RUN}`, ruleType: "FLAT", ruleConfig: { amount: 200 }, effectiveFrom: `${Y}-01-01` } });
  const pf = await call("POST", "/statutory/components", { token: tok.hr, body: { name: `Retirement fund ${RUN}`, ruleType: "PERCENTAGE", ruleConfig: { percent: 12, base: "BASIC", cap: 1800 }, effectiveFrom: `${Y}-01-01` } });
  const it = await call("POST", "/statutory/components", { token: tok.hr, body: { name: `Income tax ${RUN}`, ruleType: "BRACKET", ruleConfig: { base: "GROSS", period: "ANNUAL", brackets: [{ upTo: 300000, percent: 0 }, { upTo: 700000, percent: 5 }, { upTo: null, percent: 20 }] }, effectiveFrom: `${Y}-01-01` } });
  check("010 HR defines flat, percentage and bracket components (FR-001)", [pt, pf, it].every((r) => r.status === 201 && r.json.groupId), show(it));
  const badBrackets = await call("POST", "/statutory/components", { token: tok.hr, body: { name: "x", ruleType: "BRACKET", ruleConfig: { base: "GROSS", period: "ANNUAL", brackets: [{ upTo: 100, percent: 5 }] }, effectiveFrom: `${Y}-01-01` } });
  check("010 malformed bracket table rejected", badBrackets.status === 400, show(badBrackets));
  const empView = await call("GET", "/statutory/components", { token: tok.employee });
  const mgrEdit = await call("POST", "/statutory/components", { token: tok.manager, body: { name: "x", ruleType: "FLAT", ruleConfig: { amount: 1 }, effectiveFrom: `${Y}-01-01` } });
  check("010 statutory config is HR/Admin only (FR-009)", empView.status === 403 && mgrEdit.status === 403, `${empView.status}/${mgrEdit.status}`);
  const ex = await call("POST", "/statutory/exemptions", { token: tok.hr, body: { employeeId: b.id, groupId: pt.json.groupId, reason: "Below threshold" } });
  check("010 HR exempts an employee from one component (FR-003)", ex.status === 201, show(ex));

  // US2 — payroll applies it
  const mine = (groups, slip) => (slip.statutoryDeductions ?? []).filter((l) => groups.includes(l.groupId));
  const groups = [pt.json.groupId, pf.json.groupId, it.json.groupId];
  const run = async (m) => call("POST", "/payroll/runs", { token: tok.hr, body: { periodMonth: m, periodYear: Y } });
  const slip = async (e, m) => (await call("GET", "/payroll/payslips/me", { token: e.token })).json.find((p) => p.periodMonth === m && p.periodYear === Y);

  await run(3);
  const sa = await slip(a, 3);
  const amounts = Object.fromEntries(mine(groups, sa).map((l) => [l.groupId, l.amount]));
  check("010 payslip itemizes statutory lines matching hand math (FR-004/005, SC-002)", amounts[pt.json.groupId] === 200 && amounts[pf.json.groupId] === 1800 && amounts[it.json.groupId] === 6000, JSON.stringify(sa));
  check("010 statutory kept apart from non-statutory deductions", !Object.keys(sa.deductions).some((k) => k.includes(RUN)), JSON.stringify(sa.deductions));
  const otherStatutory = (sa.statutoryDeductions ?? []).reduce((s, l) => s + l.amount, 0);
  check("010 net pay subtracts statutory", Math.abs(sa.netPay - (80000 - otherStatutory - (sa.deductions.unpaidLeave ?? 0))) < 0.01, JSON.stringify(sa));
  const sb = await slip(b, 3);
  check("010 exempt employee has no line for that component", !mine([pt.json.groupId], sb).length && mine([pf.json.groupId], sb).length === 1, JSON.stringify(sb));

  // FR-002 / edge case: a rule change after the run doesn't touch the payslip until a re-run
  const ptV2 = await call("POST", `/statutory/components/${pt.json.groupId}/versions`, { token: tok.hr, body: { ruleType: "FLAT", ruleConfig: { amount: 300 }, effectiveFrom: `${Y}-03-15` } });
  const pfV2 = await call("POST", `/statutory/components/${pf.json.groupId}/versions`, { token: tok.hr, body: { ruleType: "PERCENTAGE", ruleConfig: { percent: 10, base: "BASIC" }, effectiveFrom: `${Y}-04-01` } });
  check("010 HR adds future-dated versions", ptV2.status === 201 && pfV2.status === 201, show(pfV2));
  const unchanged = await slip(a, 3);
  check("010 already-generated payslip unchanged until re-run", mine([pt.json.groupId], unchanged)[0]?.amount === 200, JSON.stringify(unchanged));

  const rep1 = await call("POST", "/statutory/reports", { token: tok.hr, body: { periodMonth: 3, periodYear: Y } });
  const periodSlips = (await call("GET", `/payroll/payslips?periodMonth=3&periodYear=${Y}`, { token: tok.hr })).json;
  const lineSum = Math.round(periodSlips.flatMap((p) => p.statutoryDeductions ?? []).reduce((s, l) => s + l.amount, 0) * 100) / 100;
  check("010 compliance report totals = sum of payslip lines (FR-006, SC-003)", rep1.status === 201 && rep1.json.totals.grandTotal === lineSum, `${rep1.json.totals?.grandTotal} vs ${lineSum}`);
  const ptTotal1 = rep1.json.totals.components.find((c) => c.groupId === pt.json.groupId);
  check("010 per-component total and employee count", ptTotal1?.totalWithheld === 200 && ptTotal1.employeeCount === 1, JSON.stringify(ptTotal1));

  await run(3); // re-run March: PT v2 (effective Mar 15) now applies
  const rerun = await slip(a, 3);
  check("010 re-run picks up the rule in effect for the period (FR-008)", mine([pt.json.groupId], rerun)[0]?.amount === 300, JSON.stringify(rerun));
  const rep2 = await call("POST", "/statutory/reports", { token: tok.hr, body: { periodMonth: 3, periodYear: Y } });
  check("010 regenerated report reflects corrected totals", rep2.json.totals.components.find((c) => c.groupId === pt.json.groupId)?.totalWithheld === 300, show(rep2));

  await run(4);
  const april = await slip(a, 4);
  check("010 April uses the new PF version (10% of basic, no cap)", mine([pf.json.groupId], april)[0]?.amount === 5000, JSON.stringify(april));

  // FR-007 export
  const res = await fetch(`${API}/statutory/reports/${rep2.json.id}/export`, { headers: { authorization: `Bearer ${tok.hr}` } });
  const csv = await res.text();
  check("010 report exports as a CSV file", res.status === 200 && res.headers.get("content-type").startsWith("text/csv") && csv.startsWith("Section,Period,Component") && csv.includes(`Professional tax ${RUN}`), csv.slice(0, 200));

  // Discontinue this run's components so later runs aren't affected.
  for (const g of groups) await call("POST", `/statutory/components/${g}/versions`, { token: tok.hr, body: { active: false, effectiveFrom: `${Y}-05-01` } });
  await run(5);
  const may = await slip(a, 5);
  check("010 discontinued components no longer deducted", mine(groups, may).length === 0, JSON.stringify(may));
}
