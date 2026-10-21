// specs/012-performance-management/quickstart.md, API side.
import { call, check, show, future, RUN } from "./lib.mjs";

const today = new Date().toISOString().slice(0, 10);

export default async function ({ tok, hire }) {
  const m1 = await hire(`PerfMgr1 ${RUN}`, "MANAGER");
  const m2 = await hire(`PerfMgr2 ${RUN}`, "MANAGER");
  const e = await hire(`PerfEmp ${RUN}`, "EMPLOYEE", { managerId: m1.id });

  // US1 — goals
  const g = await call("POST", "/performance/goals", { token: e.token, body: { description: "Ship onboarding v2", targetDate: future(30) } });
  check("012 employee proposes goal -> PENDING_APPROVAL (FR-001)", g.status === 201 && g.json.status === "PENDING_APPROVAL", show(g));
  const notMine = await call("POST", `/performance/goals/${g.json.id}/approve`, { token: m2.token });
  check("012 another manager can't approve", notMine.status === 403, show(notMine));
  const rc = await call("POST", `/performance/goals/${g.json.id}/request-changes`, { token: m1.token, body: { note: "Add a measurable target" } });
  check("012 manager requests changes (FR-003)", rc.json.status === "CHANGES_REQUESTED" && rc.json.changeRequestNote === "Add a measurable target", show(rc));
  const seen = (await call("GET", "/performance/goals/me", { token: e.token })).json.find((x) => x.id === g.json.id);
  check("012 employee sees the requested change", seen?.changeRequestNote === "Add a measurable target", JSON.stringify(seen));
  const rev = await call("PATCH", `/performance/goals/${g.json.id}`, { token: e.token, body: { description: "Ship onboarding v2 to 3 teams" } });
  check("012 employee revises and resubmits", rev.json.status === "PENDING_APPROVAL", show(rev));
  const ok = await call("POST", `/performance/goals/${g.json.id}/approve`, { token: m1.token });
  check("012 manager approves -> ACTIVE (FR-002)", ok.json.status === "ACTIVE", show(ok));
  await call("POST", `/performance/goals/${g.json.id}/progress`, { token: e.token, body: { progressPercent: 60, progress: "2 of 3 teams live" } });
  const mgrView = (await call("GET", `/performance/employees/${e.id}/goals`, { token: m1.token })).json.find((x) => x.id === g.json.id);
  check("012 manager sees updated progress (FR-004)", mgrView?.progressPercent === 60 && mgrView.progress === "2 of 3 teams live", JSON.stringify(mgrView));
  const stranger = await call("GET", `/performance/employees/${e.id}/goals`, { token: m2.token });
  check("012 unrelated manager can't view goals", stranger.status === 403, show(stranger));

  // US3 — cycle; US2 — review
  const cy = await call("POST", "/performance/cycles", { token: tok.hr, body: { name: `H2 ${RUN}`, startDate: today, endDate: future(60), employeeIds: [e.id] } });
  check("012 HR opens a cycle for chosen employees (FR-008)", cy.status === 201 && cy.json.reviewCount === 1, show(cy));
  const todo = await call("GET", "/performance/reviews/to-do", { token: m1.token });
  const r = todo.json.find?.((x) => x.employeeId === e.id);
  check("012 manager's to-do has the review", Boolean(r), show(todo));
  const detail = await call("GET", `/performance/reviews/${r.id}`, { token: m1.token });
  check("012 review shows the period's goals with progress (US2.1)", detail.json.goals?.some((x) => x.id === g.json.id && x.progressPercent === 60), show(detail));
  await call("PUT", `/performance/reviews/${r.id}/self-reflection`, { token: e.token, body: { employeeComments: "Proud of the rollout" } });
  await call("PATCH", `/performance/reviews/${r.id}`, { token: m1.token, body: { rating: "4", managerComments: "Strong half" } });

  // FR-011: reporting line changes before finalization -> review moves to the new manager
  await call("PATCH", `/employees/${e.id}`, { token: tok.hr, body: { managerId: m2.id } });
  const oldTodo = await call("GET", "/performance/reviews/to-do", { token: m1.token });
  const newTodo = await call("GET", "/performance/reviews/to-do", { token: m2.token });
  const moved = newTodo.json.find?.((x) => x.id === r.id);
  check("012 review transfers to the new manager, previous recorded (FR-011, SC-005)", !oldTodo.json.some((x) => x.id === r.id) && moved?.previousManagerId === m1.id && moved.managerId === m2.id, show(newTodo));
  const oldEdit = await call("PATCH", `/performance/reviews/${r.id}`, { token: m1.token, body: { rating: "1" } });
  check("012 old manager can no longer edit", oldEdit.status === 403, show(oldEdit));

  const fin = await call("POST", `/performance/reviews/${r.id}/finalize`, { token: m2.token });
  check("012 new manager finalizes; self-reflection kept (FR-005/006)", fin.json.status === "FINAL" && fin.json.employeeComments === "Proud of the rollout" && fin.json.ratingLabel === "Exceeds expectations", show(fin));
  const eEdit = await call("PUT", `/performance/reviews/${r.id}/self-reflection`, { token: e.token, body: { employeeComments: "edit" } });
  const mEdit = await call("PATCH", `/performance/reviews/${r.id}`, { token: m2.token, body: { rating: "5" } });
  check("012 final review is immutable to employee and manager (FR-007, SC-004)", eEdit.status === 409 && mEdit.status === 409, `${eEdit.status}/${mEdit.status}`);
  const corr = await call("POST", `/performance/reviews/${r.id}/corrections`, { token: tok.hr, body: { rating: "3", reason: "Calibration" } });
  check("012 HR corrects a final review", corr.status === 200 && corr.json.rating === "3" && corr.json.correctedAt, show(corr));
  const st = await call("GET", `/performance/cycles/${cy.json.id}/status`, { token: tok.hr });
  check("012 cycle status counts the completed review (FR-009)", st.json.completed === 1 && st.json.pending === 0, show(st));

  // FR-010 overdue
  const late = await hire(`PerfLate ${RUN}`, "EMPLOYEE", { managerId: m1.id });
  const past = await call("POST", "/performance/cycles", { token: tok.hr, body: { name: `Past ${RUN}`, startDate: "2025-01-01", endDate: "2025-06-30", employeeIds: [late.id] } });
  const pst = await call("GET", `/performance/cycles/${past.json.id}/status`, { token: tok.hr });
  check("012 past-due incomplete review flagged overdue (FR-010)", pst.json.overdue === 1 && pst.json.reviews[0].overdue === true, show(pst));
  const empCycle = await call("GET", "/performance/cycles", { token: e.token });
  check("012 cycle admin is HR/Admin only", empCycle.status === 403, show(empCycle));

  // FR-012
  const hist = await call("GET", `/performance/employees/${e.id}/history`, { token: e.token });
  check("012 employee sees own goal + review history (FR-012)", hist.json.goals?.length >= 1 && hist.json.reviews?.some((x) => x.id === r.id && x.status === "FINAL"), show(hist));
}
