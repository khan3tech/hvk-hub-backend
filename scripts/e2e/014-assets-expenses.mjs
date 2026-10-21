// specs/014-asset-expense-management/quickstart.md, API side.
import { call, check, show, upload, download, future, PDF, RUN } from "./lib.mjs";

export default async function ({ tok, hire }) {
  // US1 — inventory
  const a1 = await call("POST", "/assets", { token: tok.hr, body: { description: "MacBook Pro 14", identifier: `SN-${RUN}-1` } });
  check("014 HR adds an asset -> UNASSIGNED (FR-001)", a1.status === 201 && a1.json.status === "UNASSIGNED", show(a1));
  const dup = await call("POST", "/assets", { token: tok.hr, body: { description: "x", identifier: `SN-${RUN}-1` } });
  check("014 duplicate identifier refused", dup.status === 409, show(dup));
  const a2 = (await call("POST", "/assets", { token: tok.hr, body: { description: "Monitor", identifier: `SN-${RUN}-2` } })).json;

  // US2 — onboarding link
  const mgr = await hire(`AstMgr ${RUN}`, "MANAGER");
  const hireN = await hire(`AstNew ${RUN}`, "EMPLOYEE", { managerId: mgr.id });
  const itTask = () => call("GET", `/onboarding/checklists/${hireN.id}`, { token: tok.hr }).then((r) => r.json.tasks.find((t) => t.systemKey === "ASSET_ASSIGNMENT"));
  check("014 hire's checklist has an open asset-assignment task", (await itTask())?.status === "INCOMPLETE", JSON.stringify(await itTask()));
  const as = await call("POST", `/assets/${a1.json.id}/assign`, { token: tok.hr, body: { employeeId: hireN.id } });
  check("014 assign marks the asset assigned (FR-002)", as.json.status === "ASSIGNED" && as.json.assignedTo?.employeeId === hireN.id, show(as));
  check("014 assignment completes the onboarding asset task (FR-005, SC-002)", (await itTask())?.status === "COMPLETE", JSON.stringify(await itTask()));
  const other = await hire(`AstOther ${RUN}`);
  const conflict = await call("POST", `/assets/${a1.json.id}/assign`, { token: tok.hr, body: { employeeId: other.id } });
  check("014 can't assign an assigned asset to someone else (SC-004)", conflict.status === 409 && conflict.json.error?.code === "ASSET_UNAVAILABLE", show(conflict));
  await call("POST", `/assets/${a2.id}/assign`, { token: tok.hr, body: { employeeId: hireN.id } });
  const profile = await call("GET", `/employees/${hireN.id}`, { token: tok.hr });
  check("014 profile lists assigned assets (FR-004)", profile.json.assignedAssets?.length === 2, show(profile));
  const own = await call("GET", `/assets/employees/${hireN.id}`, { token: hireN.token });
  check("014 employee sees own assets", own.json.length === 2, show(own));

  // US2 — exit link
  const res = (await call("POST", "/exit/resignations", { token: hireN.token, body: { proposedLastDay: future(14) } })).json;
  await call("POST", `/exit/resignations/${res.id}/acknowledge`, { token: tok.hr, body: {} });
  const exitTask = async () => (await call("GET", `/exit/resignations/${res.id}/checklist`, { token: tok.hr })).json.tasks.find((t) => t.systemKey === "ASSET_RETURN");
  const manual = await call("POST", `/exit/tasks/${(await exitTask()).id}/complete`, { token: tok.hr });
  check("014 asset-return task can't be ticked while assets are out (US2.3)", manual.status === 409 && manual.json.error?.code === "TASK_BLOCKED", show(manual));
  await call("POST", `/assets/${a1.json.id}/return`, { token: tok.hr });
  check("014 one of two returned: task still open", (await exitTask()).status === "INCOMPLETE", JSON.stringify(await exitTask()));
  const lost = await call("POST", `/assets/${a2.id}/mark`, { token: tok.hr, body: { status: "LOST" } });
  check("014 lost asset leaves the pool (FR-003 edge case)", lost.json.status === "LOST" && lost.json.assignedTo === null, show(lost));
  check("014 last asset resolved completes the exit task (FR-006)", (await exitTask()).status === "COMPLETE", JSON.stringify(await exitTask()));
  const inv = (await call("GET", `/assets/${a1.json.id}`, { token: tok.hr })).json;
  check("014 returned asset is unassigned with history kept", inv.status === "UNASSIGNED" && inv.history.length === 1 && inv.history[0].outcome === "RETURNED", JSON.stringify(inv));
  const reassign = await call("POST", `/assets/${a2.id}/assign`, { token: tok.hr, body: { employeeId: other.id } });
  check("014 lost asset can't be assigned", reassign.status === 409, show(reassign));

  // US3 — expenses
  const emp = await hire(`ExpEmp ${RUN}`, "EMPLOYEE", { managerId: mgr.id });
  const cats = await call("GET", "/expenses/categories", { token: emp.token });
  check("014 expense categories available", cats.json.some?.((c) => c.name === "Travel" && c.requiresReceipt), show(cats));
  const noReceipt = await upload("/expenses/claims", { token: emp.token, fields: { amount: "1200", category: "Travel" } });
  check("014 receipt-required category blocks submission without one (FR-008)", noReceipt.status === 400 && noReceipt.json.error?.code === "RECEIPT_REQUIRED", show(noReceipt));
  const claim = await upload("/expenses/claims", { token: emp.token, fields: { amount: "1200.50", category: "Travel", description: "Client visit" }, file: PDF("taxi") });
  check("014 claim submitted with receipt (FR-007)", claim.status === 201 && claim.json.status === "PENDING" && claim.json.hasReceipt, show(claim));
  const q = await call("GET", "/expenses/claims/queue", { token: mgr.token });
  check("014 claim is in the manager's queue (FR-009)", q.json.some?.((c) => c.id === claim.json.id), show(q));
  const rcpt = await download(`/expenses/claims/${claim.json.id}/receipt`, mgr.token);
  const rcptOther = await download(`/expenses/claims/${claim.json.id}/receipt`, other.token);
  check("014 manager can read the receipt, unrelated employee can't", rcpt.status === 200 && rcptOther.status === 404, `${rcpt.status}/${rcptOther.status}`);
  const appr = await call("POST", `/expenses/claims/${claim.json.id}/approve`, { token: mgr.token });
  check("014 manager approves", appr.json.status === "APPROVED", show(appr));
  const before = await call("GET", "/expenses/payouts", { token: tok.hr });
  check("014 approved-unpaid claim in payout tracking (SC-005)", before.json.outstanding.some((c) => c.id === claim.json.id), show(before));
  const paid = await call("POST", `/expenses/claims/${claim.json.id}/pay`, { token: tok.hr });
  const after = await call("GET", "/expenses/payouts", { token: tok.hr });
  check("014 paid claim leaves the outstanding list (FR-011)", paid.json.status === "PAID" && !after.json.outstanding.some((c) => c.id === claim.json.id) && Math.abs(before.json.outstandingTotal - after.json.outstandingTotal - 1200.5) < 0.001, `${before.json.outstandingTotal} -> ${after.json.outstandingTotal}`);

  const c2 = (await upload("/expenses/claims", { token: emp.token, fields: { amount: "40", category: "Internet & phone" } })).json;
  const noReason = await call("POST", `/expenses/claims/${c2.id}/reject`, { token: mgr.token, body: {} });
  check("014 rejection requires a reason (FR-010)", noReason.status === 400, show(noReason));
  await call("POST", `/expenses/claims/${c2.id}/reject`, { token: mgr.token, body: { reason: "Covered by company plan" } });
  const mine = (await call("GET", "/expenses/claims/me", { token: emp.token })).json.find((c) => c.id === c2.id);
  check("014 employee sees the rejection reason", mine?.status === "REJECTED" && mine.rejectionReason === "Covered by company plan", JSON.stringify(mine));

  // Edge case: pending claim follows a manager change
  const c3 = (await upload("/expenses/claims", { token: emp.token, fields: { amount: "15", category: "Internet & phone" } })).json;
  const mgr2 = await hire(`ExpMgr2 ${RUN}`, "MANAGER");
  await call("PATCH", `/employees/${emp.id}`, { token: tok.hr, body: { managerId: mgr2.id } });
  const q1 = await call("GET", "/expenses/claims/queue", { token: mgr.token });
  const q2 = await call("GET", "/expenses/claims/queue", { token: mgr2.token });
  check("014 pending claim moves to the new manager's queue", !q1.json.some((c) => c.id === c3.id) && q2.json.some((c) => c.id === c3.id), `${q1.json.length}/${q2.json.length}`);
}
