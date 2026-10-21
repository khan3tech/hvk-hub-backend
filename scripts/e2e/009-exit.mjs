// specs/009-resignation-exit/quickstart.md, API side.
import { call, check, show, login, future, RUN } from "./lib.mjs";

export default async function ({ tok, hire }) {
  const mgr = await hire(`ExitMgr ${RUN}`, "MANAGER");
  const leaver = await hire(`ExitLeaver ${RUN}`, "MANAGER", { managerId: mgr.id });
  const report = await hire(`ExitReport ${RUN}`, "EMPLOYEE", { managerId: leaver.id });
  const otherMgr = await hire(`ExitOtherMgr ${RUN}`, "MANAGER");

  // US1
  const r = await call("POST", "/exit/resignations", { token: leaver.token, body: { proposedLastDay: future(30), reason: "Relocating" } });
  check("009 employee submits resignation -> PENDING (FR-001)", r.status === 201 && r.json.status === "PENDING", show(r));
  const dup = await call("POST", "/exit/resignations", { token: leaver.token, body: { proposedLastDay: future(31) } });
  check("009 second active resignation refused (FR-002)", dup.status === 409, show(dup));
  const mine = await call("GET", "/exit/resignations/me", { token: leaver.token });
  check("009 employee sees it pending", mine.json[0]?.status === "PENDING", show(mine));
  const mgrList = await call("GET", "/exit/resignations", { token: mgr.token });
  check("009 manager sees report's resignation", mgrList.json.some?.((x) => x.id === r.json.id), show(mgrList));
  const otherList = await call("GET", "/exit/resignations", { token: otherMgr.token });
  check("009 unrelated manager doesn't", !otherList.json.some?.((x) => x.id === r.json.id), show(otherList));
  const notif = (await call("GET", "/notifications", { token: mgr.token })).json.items.find((n) => n.type === "RESIGNATION_SUBMITTED");
  check("009 manager notified of submission", notif?.link.includes(r.json.id), JSON.stringify(notif));

  // US2
  const deny = await call("POST", `/exit/resignations/${r.json.id}/acknowledge`, { token: otherMgr.token, body: {} });
  check("009 another manager can't acknowledge (FR-003)", deny.status === 403, show(deny));
  const ack = await call("POST", `/exit/resignations/${r.json.id}/acknowledge`, { token: mgr.token, body: { confirmedLastDay: future(45) } });
  check("009 manager acknowledges with adjusted day -> SERVING_NOTICE, both dates kept", ack.json.status === "SERVING_NOTICE" && ack.json.confirmedLastDay === future(45) && ack.json.proposedLastDay === future(30), show(ack));
  const profile = await call("GET", `/employees/${leaver.id}`, { token: tok.hr });
  check("009 employee status shows serving notice (FR-004)", profile.json.exitStatus === "SERVING_NOTICE" && profile.json.lastWorkingDay === future(45), show(profile));

  // US3
  const cl = await call("GET", `/exit/resignations/${r.json.id}/checklist`, { token: tok.hr });
  const roles = new Set(cl.json.tasks?.map((t) => t.ownerRole));
  check("009 checklist with IT/FINANCE/HR tasks (FR-005)", roles.has("IT") && roles.has("FINANCE") && roles.has("HR"), show(cl));
  check("009 resigning manager's reports flagged for reassignment (FR-009)", cl.json.reportsToReassign?.some((x) => x.id === report.id), show(cl));
  await call("PUT", `/exit/resignations/${r.json.id}/exit-interview`, { token: tok.hr, body: { notes: "Wants remote work" } });
  const hrView = await call("GET", `/exit/resignations/${r.json.id}`, { token: tok.hr });
  const empView = await call("GET", `/exit/resignations/${r.json.id}`, { token: leaver.token });
  check("009 exit-interview notes HR-only (FR-007)", hrView.json.exitInterviewNotes === "Wants remote work" && !("exitInterviewNotes" in empView.json), show(empView));
  const blocked = await call("POST", `/exit/resignations/${r.json.id}/offboard`, { token: tok.hr, body: {} });
  check("009 offboard blocked while clearance incomplete, lists remaining (FR-006)", blocked.status === 409 && blocked.json.error?.fields?.remainingTasks?.length === cl.json.tasks.length, show(blocked));
  for (const t of cl.json.tasks) await call("POST", `/exit/tasks/${t.id}/complete`, { token: tok.hr });
  const done = await call("POST", `/exit/resignations/${r.json.id}/offboard`, { token: tok.hr, body: {} });
  check("009 offboarded after full clearance -> COMPLETED", done.status === 200 && done.json.status === "COMPLETED" && done.json.forcedOffboard === false, show(done));
  const relog = await login(leaver.email, leaver.temporaryPassword);
  const oldSession = await call("GET", "/auth/me", { token: leaver.token });
  check("009 access revoked on offboarding (FR-010, SC-004)", relog.status === 401 && oldSession.status === 401, `${relog.status}/${oldSession.status}`);
  const history = await call("GET", `/exit/resignations/${r.json.id}/checklist`, { token: tok.hr });
  check("009 history retained after offboarding (FR-011)", history.status === 200 && history.json.remainingCount === 0, show(history));

  // Withdrawal (FR-008, SC-005)
  const stayer = await hire(`ExitStayer ${RUN}`, "EMPLOYEE", { managerId: mgr.id });
  const r2 = (await call("POST", "/exit/resignations", { token: stayer.token, body: { proposedLastDay: future(20) } })).json;
  await call("POST", `/exit/resignations/${r2.id}/acknowledge`, { token: tok.hr, body: {} });
  const wd = await call("POST", `/exit/resignations/${r2.id}/withdraw`, { token: tok.hr });
  const stayerProfile = await call("GET", `/employees/${stayer.id}`, { token: tok.hr });
  const closed = await call("GET", `/exit/resignations/${r2.id}/checklist`, { token: tok.hr });
  check("009 withdrawal restores active with no serving-notice trace", wd.json.status === "WITHDRAWN" && stayerProfile.json.status === "ACTIVE" && stayerProfile.json.exitStatus === null && closed.json.closedAt, show(stayerProfile));
  const stillIn = await call("GET", "/auth/me", { token: stayer.token });
  check("009 withdrawn employee keeps access", stillIn.status === 200, show(stillIn));

  // Forced offboard keeps open tasks visible
  const forced = await hire(`ExitForced ${RUN}`);
  const r3 = (await call("POST", "/exit/resignations", { token: forced.token, body: { proposedLastDay: future(5) } })).json;
  await call("POST", `/exit/resignations/${r3.id}/acknowledge`, { token: tok.hr, body: {} });
  const f = await call("POST", `/exit/resignations/${r3.id}/offboard`, { token: tok.hr, body: { force: true } });
  const fcl = await call("GET", `/exit/resignations/${r3.id}/checklist`, { token: tok.hr });
  check("009 forced offboard allowed, open tasks stay visible", f.json.status === "COMPLETED" && f.json.forcedOffboard === true && fcl.json.remainingCount > 0, show(fcl));
}
