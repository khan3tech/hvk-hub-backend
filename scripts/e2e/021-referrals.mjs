// specs/021-referral-program/quickstart.md, API side.
import { call, check, show, upload, PDF, RUN } from "./lib.mjs";

export default async function ({ tok, hire }) {
  const referrer = await hire(`Referrer ${RUN}`);
  await call("POST", `/payroll/salary-structures/${referrer.id}`, { token: tok.hr, body: { basic: 40000, hra: 10000, allowances: {}, effectiveFrom: "2020-01-01" } });
  const dept = (await call("GET", "/departments", { token: tok.hr })).json[0];
  const posting = (await call("POST", "/recruitment/postings", { token: tok.hr, body: { title: `Referral role ${RUN}`, departmentId: dept.id, openings: 3 } })).json;
  const refer = (name, email) => upload("/referrals", { token: referrer.token, fields: { postingId: posting.id, name, email }, file: PDF("cv") });

  // FR-004: zero qualifying period first
  const cfg = await call("PUT", "/referrals/config", { token: tok.hr, body: { bonusAmount: 5000, qualifyingDays: 0 } });
  check("021 HR configures bonus + zero qualifying period (FR-004, edge case)", cfg.json.bonusAmount === 5000 && cfg.json.qualifyingDays === 0, show(cfg));

  // US1
  const a = await refer("Alex Fast", `alex.${RUN}@example.com`);
  check("021 employee refers a candidate into the pipeline (FR-001)", a.status === 201 && a.json.status === "IN_PIPELINE" && a.json.stage === "APPLIED", show(a));
  const appA = (await call("GET", `/recruitment/postings/${posting.id}/applications`, { token: tok.hr })).json.find((x) => x.candidate?.email === `alex.${RUN}@example.com`);
  check("021 application tagged as a referral by that employee", appA?.source === "REFERRAL" && appA.referredByEmployeeId === referrer.id, JSON.stringify(appA));
  const dup = await refer("Alex Fast", `alex.${RUN}@example.com`);
  check("021 duplicate referral for the same posting refused (FR-002)", dup.status === 409, show(dup));
  const self = await upload("/referrals", { token: referrer.token, fields: { postingId: posting.id, name: "Me", email: referrer.email }, file: PDF("cv") });
  check("021 can't refer yourself", self.status === 400, show(self));

  // US2: hire with zero-day period -> payable immediately
  await call("PATCH", `/recruitment/applications/${appA.id}/stage`, { token: tok.hr, body: { stage: "INTERVIEW" } });
  const mineMid = (await call("GET", "/referrals/me", { token: referrer.token })).json.find((r) => r.id === a.json.id);
  check("021 referrer sees stage only, no interview detail (FR-003)", mineMid?.stage === "INTERVIEW" && !("interviewRounds" in mineMid) && !("feedback" in mineMid), JSON.stringify(mineMid));
  await call("PATCH", `/recruitment/applications/${appA.id}/stage`, { token: tok.hr, body: { stage: "HIRED" } });
  const afterHire = (await call("GET", "/referrals/me", { token: referrer.token })).json.find((r) => r.id === a.json.id);
  check("021 hired with a zero-day period -> payable (FR-005)", afterHire?.status === "PAYABLE", JSON.stringify(afterHire));

  // US3: payroll
  const Y = 2091 + (parseInt(RUN, 36) % 8);
  const sched = await call("POST", `/referrals/${a.json.id}/schedule-payout`, { token: tok.hr, body: { periodMonth: 6, periodYear: Y } });
  check("021 HR schedules the bonus for a payroll period (FR-008)", sched.json.payrollPeriod === `${Y}-06`, show(sched));
  await call("POST", "/payroll/runs", { token: tok.hr, body: { periodMonth: 6, periodYear: Y } });
  const slip = (await call("GET", "/payroll/payslips/me", { token: referrer.token })).json.find((p) => p.periodYear === Y && p.periodMonth === 6);
  const bonusKey = Object.keys(slip?.earnings ?? {}).find((k) => k.startsWith("Referral bonus"));
  check("021 payslip has a distinct referral-bonus earning line (SC-004)", bonusKey && slip.earnings[bonusKey] === 5000 && slip.earnings.basic === 40000, JSON.stringify(slip?.earnings));
  const paid = (await call("GET", "/referrals", { token: tok.hr })).json.find((r) => r.id === a.json.id);
  check("021 bonus marked paid after the run (FR-009)", paid?.status === "PAID" && paid.paidAt, JSON.stringify(paid));
  const again = await call("POST", `/referrals/${a.json.id}/schedule-payout`, { token: tok.hr, body: { periodMonth: 7, periodYear: Y } });
  check("021 a paid bonus can't be scheduled again (SC-005)", again.status === 409, show(again));
  await call("POST", "/payroll/runs", { token: tok.hr, body: { periodMonth: 6, periodYear: Y } });
  const rerun = (await call("GET", "/payroll/payslips/me", { token: referrer.token })).json.filter((p) => p.periodYear === Y && p.periodMonth === 6);
  check("021 re-running the period keeps exactly one bonus line", rerun.length === 1 && Object.keys(rerun[0].earnings).filter((k) => k.startsWith("Referral bonus")).length === 1, JSON.stringify(rerun));
  await call("POST", "/payroll/runs", { token: tok.hr, body: { periodMonth: 7, periodYear: Y } });
  const july = (await call("GET", "/payroll/payslips/me", { token: referrer.token })).json.find((p) => p.periodYear === Y && p.periodMonth === 7);
  check("021 the bonus never appears in another period", july && !Object.keys(july.earnings).some((k) => k.startsWith("Referral bonus")), JSON.stringify(july?.earnings));

  // FR-010 + FR-006: terms locked at submission; early exit forfeits
  await call("PUT", "/referrals/config", { token: tok.hr, body: { bonusAmount: 5000, qualifyingDays: 30 } });
  const b = await refer("Bea Early", `bea.${RUN}@example.com`);
  await call("PUT", "/referrals/config", { token: tok.hr, body: { bonusAmount: 9999, qualifyingDays: 60 } });
  check("021 later config changes don't touch an in-progress referral (FR-010)", b.json.bonusAmount === 5000 && b.json.qualifyingDays === 30, show(b));
  const appB = (await call("GET", `/recruitment/postings/${posting.id}/applications`, { token: tok.hr })).json.find((x) => x.candidate?.email === `bea.${RUN}@example.com`);
  await call("PATCH", `/recruitment/applications/${appB.id}/stage`, { token: tok.hr, body: { stage: "HIRED" } });
  const pending = (await call("GET", "/referrals", { token: tok.hr })).json.find((r) => r.id === b.json.id);
  check("021 hired with a 30-day period -> pending (SC-002)", pending?.status === "PENDING" && pending.qualifyingUntil, JSON.stringify(pending));
  const beaEmp = (await call("POST", "/employees", { token: tok.hr, body: { name: "Bea Early", email: `bea.${RUN}@example.com`, departmentId: dept.id, designationId: (await call("GET", "/designations", { token: tok.hr })).json[0].id, dateOfJoining: new Date().toISOString().slice(0, 10) } })).json;
  await call("POST", `/employees/${beaEmp.id}/offboard`, { token: tok.hr });
  const forfeited = (await call("GET", "/referrals", { token: tok.hr })).json.find((r) => r.id === b.json.id);
  check("021 hire left before the period ended -> forfeited, never payable (FR-006, SC-003)", forfeited?.status === "FORFEITED" && forfeited.hireEmployeeId === beaEmp.id, JSON.stringify(forfeited));

  // FR-007
  const c = await refer("Cal Rejected", `cal.${RUN}@example.com`);
  const appC = (await call("GET", `/recruitment/postings/${posting.id}/applications`, { token: tok.hr })).json.find((x) => x.candidate?.email === `cal.${RUN}@example.com`);
  await call("PATCH", `/recruitment/applications/${appC.id}/stage`, { token: tok.hr, body: { stage: "REJECTED" } });
  const closed = (await call("GET", "/referrals/me", { token: referrer.token })).json.find((r) => r.id === c.json.id);
  check("021 rejected -> closed with no bonus, visible to the referrer (FR-007)", closed?.status === "CLOSED_NO_BONUS", JSON.stringify(closed));
  const empAll = await call("GET", "/referrals", { token: referrer.token });
  check("021 the full referral list is HR/Admin only", empAll.status === 403, show(empAll));
}
