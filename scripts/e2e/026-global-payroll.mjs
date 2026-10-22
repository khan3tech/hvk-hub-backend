// specs/026-global-multi-currency-payroll/quickstart.md, API side. Runs in its own organization
// so turning multi-country on doesn't change payroll for the seeded one.
import { call, check, show, login, platformToken, RUN } from "./lib.mjs";

export default async function ({ tok }) {
  const pt = await platformToken();
  const prov = await call("POST", "/platform/organizations", { token: pt, body: { name: `Global ${RUN}`, slug: `global-${RUN}`, adminName: "Gia Admin", adminEmail: `gia.${RUN}@global.test` } });
  const g = (await login(`gia.${RUN}@global.test`, prov.json.admin.temporaryPassword)).json.accessToken;
  const dept = (await call("GET", "/departments", { token: g })).json[0];
  const desig = (await call("GET", "/designations", { token: g })).json[0];
  const hire = async (name) => (await call("POST", "/employees", { token: g, body: { name, email: `${name.toLowerCase()}.${RUN}@global.test`, departmentId: dept.id, designationId: desig.id, dateOfJoining: "2025-01-01", role: "EMPLOYEE" } })).json;
  const salary = (id, basic) => call("POST", `/payroll/salary-structures/${id}`, { token: g, body: { basic, hra: 0, allowances: {}, effectiveFrom: "2025-01-01" } });
  const run = (m) => call("POST", "/payroll/runs", { token: g, body: { periodMonth: m, periodYear: 2030 } });
  const slipOf = async (id, m) => (await call("GET", `/payroll/payslips?employeeId=${id}&periodMonth=${m}&periodYear=2030`, { token: g })).json[0];
  const reason = (r, id) => r.json.skipped?.find((s) => s.employeeId === id)?.reason;

  const home = await hire("Hana");
  const india = await hire("Ishan");
  const us = await hire("Uma");
  const gb = await hire("Gus");

  // FR-011 / SC-005: a single-country org configures nothing new.
  await salary(home.id, 100000);
  const settings0 = await call("GET", "/payroll/currency-settings", { token: g });
  const p1 = await run(1);
  const s1 = await slipOf(home.id, 1);
  check("026 single-country org: no new setup, payroll as before (FR-011, SC-005)", settings0.json.multiCountry === false && p1.json.payslipCount === 1 && s1?.currency === "INR" && s1.country === null, `${show(settings0)} | ${JSON.stringify(s1)}`);

  // US1 — assignments
  const bad = await call("POST", `/payroll/assignments/${us.id}`, { token: g, body: { country: "US", currency: "XYZ", effectiveFrom: "2020-01-01" } });
  check("026 unknown currency codes are rejected", bad.status === 400, show(bad));
  const hrElsewhere = await call("POST", `/payroll/assignments/${us.id}`, { token: tok.hr, body: { country: "US", currency: "USD", effectiveFrom: "2020-01-01" } });
  check("026 another organization can't assign this org's employees", hrElsewhere.status === 404, show(hrElsewhere));
  const usA = await call("POST", `/payroll/assignments/${us.id}`, { token: g, body: { country: "us", currency: "usd", effectiveFrom: "2020-01-01" } });
  await call("POST", `/payroll/assignments/${gb.id}`, { token: g, body: { country: "GB", currency: "GBP", effectiveFrom: "2020-01-01" } });
  check("026 HR assigns a payroll country and currency (FR-001)", usA.status === 201 && usA.json.current.country === "US" && usA.json.current.currency === "USD", show(usA));
  const usSalary = await salary(us.id, 5000);
  await salary(gb.id, 4000);
  await salary(india.id, 80000);
  check("026 salary structure is in the employee's currency (FR-004)", usSalary.json.currency === "USD", show(usSalary));
  await call("POST", "/statutory/components", { token: g, body: { name: "Home tax", ruleType: "FLAT", ruleConfig: { amount: 100 }, effectiveFrom: "2020-01-01" } });
  await call("POST", "/statutory/components", { token: g, body: { name: "US tax", ruleType: "FLAT", ruleConfig: { amount: 300 }, effectiveFrom: "2020-01-01", country: "US" } });

  const p2 = await run(2);
  check("026 multi-country: no country means no payslip, reported clearly (FR-002)", reason(p2, home.id) === "NO_PAYROLL_COUNTRY" && reason(p2, india.id) === "NO_PAYROLL_COUNTRY", show(p2));
  check("026 a country with no statutory components is skipped with a reason (FR-006)", reason(p2, gb.id) === "NO_STATUTORY_COMPONENTS_FOR_COUNTRY", show(p2));

  // US2 — one run across countries
  const set = await call("PUT", "/payroll/currency-settings", { token: g, body: { defaultCountry: "IN", defaultCurrency: "INR", reportingCurrency: "USD" } });
  check("026 home country/currency and reporting currency (FR-008)", set.json.multiCountry === true && set.json.reportingCurrency === "USD", show(set));
  const p3 = await run(3);
  const [h3, i3, u3] = [await slipOf(home.id, 3), await slipOf(india.id, 3), await slipOf(us.id, 3)];
  const names = (s) => (s?.statutoryDeductions ?? []).map((l) => l.name).join(",");
  check("026 one run, each in their own country and currency (FR-003–005, SC-002)", p3.json.payslipCount === 3 && u3?.currency === "USD" && u3.country === "US" && i3?.currency === "INR" && i3.country === "IN" && h3?.currency === "INR", show(p3));
  check("026 no cross-country statutory components (SC-003)", names(u3) === "US tax" && names(i3) === "Home tax" && names(h3) === "Home tax", `${names(u3)} | ${names(i3)} | ${names(h3)}`);
  const groups = p3.json.byCountry ?? [];
  check("026 run summary labelled by country, not blended (US2.2)", groups.length === 2 && groups.some((x) => x.country === "US" && x.currency === "USD" && x.payslipCount === 1) && groups.some((x) => x.country === "IN" && x.payslipCount === 2), JSON.stringify(groups));

  // Transfers: future-dated doesn't move this period; past payslips keep their context.
  await call("POST", `/payroll/assignments/${home.id}`, { token: g, body: { country: "US", currency: "USD", effectiveFrom: "2030-04-01" } });
  const homeNow = (await call("GET", `/payroll/assignments/${home.id}`, { token: g })).json;
  const p4 = await run(4);
  const h3again = await slipOf(home.id, 3);
  check("026 transfer from a future date; past payslips keep their currency (US1.3, FR-007)", homeNow.current.country === "IN" && homeNow.history.length === 1 && h3again.currency === "INR" && h3again.country === "IN" && reason(p4, home.id) === "CURRENCY_MISMATCH", `${JSON.stringify(homeNow)} | ${show(p4)}`);

  // US3 — reporting currency
  const missing = await call("GET", "/payroll/reporting-total?periodMonth=3&periodYear=2030", { token: g });
  check("026 missing rate is called out, total withheld (FR-010)", missing.json.complete === false && missing.json.missingRates.join() === "INR" && missing.json.totalNetPay === null, show(missing));
  await call("PUT", "/payroll/exchange-rates", { token: g, body: { fromCurrency: "INR", rate: 0.012, periodMonth: 3, periodYear: 2030 } });
  const total = await call("GET", "/payroll/reporting-total?periodMonth=3&periodYear=2030", { token: g });
  const manual = Math.round(((h3.netPay + i3.netPay) * 0.012 + u3.netPay) * 100) / 100;
  check("026 reporting total matches manual conversion (FR-009, SC-004)", total.json.complete === true && total.json.totalNetPay === manual, `${show(total)} vs ${manual}`);
  await call("PUT", "/payroll/exchange-rates", { token: g, body: { fromCurrency: "INR", rate: 0.0125, periodMonth: 3, periodYear: 2030 } });
  const corrected = await call("GET", "/payroll/reporting-total?periodMonth=3&periodYear=2030", { token: g });
  const i3after = await slipOf(india.id, 3);
  check("026 corrected rate changes only the reporting view (edge case)", corrected.json.totalNetPay === Math.round(((h3.netPay + i3.netPay) * 0.0125 + u3.netPay) * 100) / 100 && i3after.netPay === i3.netPay, show(corrected));
  await call("POST", `/payroll/salary-structures/${us.id}`, { token: g, body: { basic: 6000, hra: 0, allowances: {}, effectiveFrom: "2026-01-01" } });
  await run(3);
  const rerun = await call("GET", "/payroll/reporting-total?periodMonth=3&periodYear=2030", { token: g });
  check("026 re-run period: reporting total reflects corrected payslips (US3.2)", rerun.json.byCurrency.find((x) => x.currency === "USD")?.netPay === 6000 - 300, show(rerun));
}
