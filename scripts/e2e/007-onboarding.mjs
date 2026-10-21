// specs/007-employee-onboarding/quickstart.md, API side.
import { call, check, show, RUN } from "./lib.mjs";

export default async function ({ tok, me, hire }) {
  const mgr = await hire(`OnbMgr ${RUN}`, "MANAGER");
  const newbie = await hire(`OnbNew ${RUN}`, "EMPLOYEE", { managerId: mgr.id, dateOfJoining: "2026-01-05" });

  // US1
  const cl = await call("GET", `/onboarding/checklists/${newbie.id}`, { token: tok.hr });
  check("007 checklist auto-attached on create, all incomplete (FR-001, SC-001)", cl.status === 200 && cl.json.totalCount >= 1 && cl.json.completedCount === 0, show(cl));
  const profile = await call("GET", `/employees/${newbie.id}`, { token: tok.hr });
  check("007 profile shows onboarding IN_PROGRESS (FR-007)", profile.json.onboardingStatus === "IN_PROGRESS", show(profile));
  const extra = await call("POST", `/onboarding/checklists/${newbie.id}/tasks`, { token: tok.hr, body: { description: `Visa paperwork ${RUN}` } });
  check("007 HR adds a one-off task, defaulting owner to HR (FR-002/003)", extra.status === 201 && extra.json.ownerRole === "HR", show(extra));
  const other = await call("GET", `/onboarding/checklists/${me.manager.employeeId}`, { token: tok.hr });
  check("007 one-off task only on that hire's checklist", other.status === 404 || !other.json.tasks?.some((t) => t.description.includes(RUN)), show(other));

  // US2
  const tasks = (await call("GET", "/onboarding/me", { token: newbie.token })).json.tasks;
  const own = tasks.find((t) => t.ownerRole === "EMPLOYEE");
  const mgrTask = tasks.find((t) => t.ownerRole === "MANAGER");
  const hrTask = tasks.find((t) => t.ownerRole === "HR");
  const denied = await call("POST", `/onboarding/tasks/${hrTask.id}/complete`, { token: newbie.token });
  check("007 hire cannot complete an HR task", denied.status === 403, show(denied));
  const done = await call("POST", `/onboarding/tasks/${own.id}/complete`, { token: newbie.token });
  check("007 hire completes own task, attributed (FR-004, SC-003)", done.status === 200 && done.json.completedById === newbie.id && done.json.completedAt, show(done));
  const myMgrTasks = await call("GET", "/onboarding/tasks/me", { token: mgr.token });
  check("007 manager sees the manager-owned task in their to-dos", myMgrTasks.json.some?.((t) => t.id === mgrTask.id), show(myMgrTasks));
  const mDone = await call("POST", `/onboarding/tasks/${mgrTask.id}/complete`, { token: mgr.token });
  check("007 manager completes manager task", mDone.status === 200, show(mDone));
  const again = await call("POST", `/onboarding/tasks/${mgrTask.id}/complete`, { token: mgr.token });
  check("007 completing twice -> 409", again.status === 409, show(again));

  // FR-006 reassignment
  const helper = await hire(`OnbHelper ${RUN}`);
  const reassigned = await call("PATCH", `/onboarding/tasks/${hrTask.id}`, { token: tok.hr, body: { ownerEmployeeId: helper.id } });
  check("007 HR reassigns a task to a specific employee", reassigned.status === 200 && reassigned.json.ownerEmployeeId === helper.id, show(reassigned));
  const helperDone = await call("POST", `/onboarding/tasks/${hrTask.id}/complete`, { token: helper.token });
  check("007 reassigned owner can complete it", helperDone.status === 200, show(helperDone));

  // US3 overview
  const overview = await call("GET", "/onboarding/overview", { token: tok.hr });
  const entry = overview.json.find?.((e) => e.employeeId === newbie.id);
  check("007 overview shows progress + stalled past joining date (FR-008/009)", entry && entry.completedCount === 3 && entry.stalled === true, show(overview));
  const empOverview = await call("GET", "/onboarding/overview", { token: tok.employee });
  check("007 overview is HR/Admin only", empOverview.status === 403, show(empOverview));

  // FR-010 template edits don't touch existing checklists
  const before = (await call("GET", `/onboarding/checklists/${newbie.id}`, { token: tok.hr })).json.totalCount;
  const tpl = await call("POST", "/onboarding/templates", { token: tok.hr, body: { description: `Template ${RUN}`, ownerRole: "EMPLOYEE" } });
  const after = (await call("GET", `/onboarding/checklists/${newbie.id}`, { token: tok.hr })).json.totalCount;
  check("007 template change leaves existing checklist untouched", tpl.status === 201 && before === after, `${before} vs ${after}`);
  await call("DELETE", `/onboarding/templates/${tpl.json.id}`, { token: tok.hr });

  // Finish everything -> leaves the overview, status COMPLETE (SC-004)
  const remaining = (await call("GET", `/onboarding/checklists/${newbie.id}`, { token: tok.hr })).json.tasks.filter((t) => t.status === "INCOMPLETE");
  for (const t of remaining) await call("POST", `/onboarding/tasks/${t.id}/complete`, { token: tok.hr });
  const overview2 = await call("GET", "/onboarding/overview", { token: tok.hr });
  check("007 completed hire leaves the overview", !overview2.json.some((e) => e.employeeId === newbie.id), show(overview2));
  const profile2 = await call("GET", `/employees/${newbie.id}`, { token: tok.hr });
  check("007 profile shows COMPLETE", profile2.json.onboardingStatus === "COMPLETE", show(profile2));

  // FR-005 manual attach for a legacy employee
  const legacy = (await call("GET", `/onboarding/checklists/${me.employee.employeeId}`, { token: tok.hr })).status;
  const attach = await call("POST", `/onboarding/checklists/${me.employee.employeeId}`, { token: tok.hr });
  check("007 HR attaches a checklist to an existing employee (or 409 if one exists)", legacy === 404 ? attach.status === 201 : attach.status === 409, show(attach));
}
