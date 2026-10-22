// specs/024-succession-planning/quickstart.md, API side.
import { call, check, show, RUN } from "./lib.mjs";

export default async function ({ tok, hire, department }) {
  const dept = await department(`Succession ${RUN}`);
  const other = await department(`Succession other ${RUN}`);
  const lead = await hire(`SuccLead ${RUN}`, "MANAGER", { departmentId: dept.id });
  const cfo = await hire(`SuccCfo ${RUN}`, "EMPLOYEE", { departmentId: other.id });
  const ops = await hire(`SuccOps ${RUN}`, "EMPLOYEE", { departmentId: dept.id });
  const sam = await hire(`SuccSam ${RUN}`, "EMPLOYEE", { departmentId: dept.id });
  const tia = await hire(`SuccTia ${RUN}`, "EMPLOYEE", { departmentId: dept.id });

  // US1 — critical positions
  const mgrMark = await call("PUT", `/succession/positions/${lead.id}`, { token: tok.manager });
  check("024 non-HR can't mark a position critical (US1.3)", mgrMark.status === 403, show(mgrMark));
  const marked = await call("PUT", `/succession/positions/${lead.id}`, { token: tok.hr });
  check("024 HR marks a position critical (FR-001)", marked.status === 200 && marked.json.isCritical && marked.json.risk === "NO_COVERAGE", show(marked));
  const profile = await call("GET", `/employees/${lead.id}`, { token: tok.hr });
  const ownProfile = await call("GET", `/employees/${lead.id}`, { token: lead.token });
  check("024 flag on the profile, HR/Admin only (US1.1, FR-010)", profile.json.criticalPosition === true && !("criticalPosition" in ownProfile.json), `${show(profile)} | ${show(ownProfile)}`);
  const chart = await call("GET", `/org-chart/search?q=${encodeURIComponent(`SuccLead ${RUN}`)}`, { token: tok.hr });
  const chartEmp = await call("GET", `/org-chart/search?q=${encodeURIComponent(`SuccLead ${RUN}`)}`, { token: tok.employee });
  check("024 flag on the org chart for HR only (US1)", chart.json[0]?.criticalPosition === true && chartEmp.json[0] && !("criticalPosition" in chartEmp.json[0]), `${show(chart)} | ${show(chartEmp)}`);

  // US2 — successors
  const s1 = await call("POST", `/succession/positions/${lead.id}/successors`, { token: tok.hr, body: { employeeId: sam.id, readinessLevel: "DEVELOPING" } });
  const s2 = await call("POST", `/succession/positions/${lead.id}/successors`, { token: tok.hr, body: { employeeId: tia.id, readinessLevel: "READY_1_2_YEARS" } });
  check("024 two successors with readiness levels (FR-002)", s2.status === 201 && s2.json.successors.length === 2 && s2.json.risk === "NOT_READY", show(s2));
  const external = await call("POST", `/succession/positions/${lead.id}/successors`, { token: tok.hr, body: { employeeId: "not-an-employee", readinessLevel: "READY_NOW" } });
  check("024 successor must be an active employee (FR-003)", external.status === 400 && external.json.error?.code === "SUCCESSOR_NOT_ACTIVE", show(external));
  const samEntry = s1.json.successors.find((s) => s.employee.id === sam.id);
  const updated = await call("PATCH", `/succession/successors/${samEntry.id}`, { token: tok.hr, body: { readinessLevel: "READY_NOW", note: "Led the Q3 migration" } });
  const samNow = updated.json.successors.find((s) => s.id === samEntry.id);
  check("024 readiness change recorded with history (FR-004)", samNow.readinessLevel === "READY_NOW" && samNow.history.length === 2 && samNow.history[1].fromLevel === "DEVELOPING" && updated.json.risk === "READY_NOW", JSON.stringify(samNow));

  // US3 — overview
  await call("PUT", `/succession/positions/${cfo.id}`, { token: tok.hr });
  await call("PUT", `/succession/positions/${ops.id}`, { token: tok.hr });
  await call("POST", `/succession/positions/${ops.id}/successors`, { token: tok.hr, body: { employeeId: sam.id, readinessLevel: "DEVELOPING" } });
  const ov = await call("GET", "/succession/overview", { token: tok.hr });
  const inGroup = (g, id) => ov.json.groups?.[g]?.some((p) => p.position.id === id);
  check("024 overview groups by risk (FR-007, US3.1-2)", inGroup("NO_COVERAGE", cfo.id) && inGroup("NOT_READY", ops.id) && inGroup("READY_NOW", lead.id), show(ov));
  check("024 successor covering several positions is surfaced (FR-009)", ov.json.multiPositionSuccessors.some((m) => m.employee.id === sam.id && m.positions.length === 2), JSON.stringify(ov.json.multiPositionSuccessors));
  const filtered = await call("GET", `/succession/overview?departmentId=${other.id}`, { token: tok.hr });
  check("024 department filter (FR-008)", filtered.json.totals.critical === 1 && filtered.json.groups.NO_COVERAGE[0]?.position.id === cfo.id, show(filtered));
  const mgrOverview = await call("GET", "/succession/overview", { token: tok.manager });
  const empPlan = await call("GET", `/succession/positions/${lead.id}`, { token: sam.token });
  check("024 succession data is HR/Admin only (FR-010, SC-004)", mgrOverview.status === 403 && empPlan.status === 403, `${show(mgrOverview)} | ${show(empPlan)}`);

  // Edge cases — offboarded successor, vacant position, unmark
  await call("POST", `/employees/${sam.id}/offboard`, { token: tok.hr });
  const leadPlan = (await call("GET", `/succession/positions/${lead.id}`, { token: tok.hr })).json;
  const opsPlan = (await call("GET", `/succession/positions/${ops.id}`, { token: tok.hr })).json;
  const samOn = (p) => p.successors.find((s) => s.employee.id === sam.id);
  check("024 offboarded successor flagged invalid on every plan, kept on record (FR-005, SC-003)", samOn(leadPlan)?.isValid === false && samOn(leadPlan).invalidReason === "Offboarded" && samOn(opsPlan)?.isValid === false && leadPlan.risk === "NOT_READY" && opsPlan.risk === "NO_COVERAGE", `${JSON.stringify(leadPlan)} | ${JSON.stringify(opsPlan)}`);
  await call("POST", `/employees/${lead.id}/offboard`, { token: tok.hr });
  const vacant = (await call("GET", "/succession/overview", { token: tok.hr })).json;
  const vacantRow = Object.values(vacant.groups).flat().find((p) => p.position.id === lead.id);
  check("024 vacant critical position keeps its plan (FR-006)", vacantRow?.position.vacant === true && vacantRow.validSuccessors === 1, JSON.stringify(vacantRow));
  const unmark = await call("DELETE", `/succession/positions/${cfo.id}`, { token: tok.hr });
  const afterUnmark = (await call("GET", "/succession/overview", { token: tok.hr })).json;
  check("024 unmarking removes it from the overview, plan kept (FR-001)", unmark.json.isCritical === false && !Object.values(afterUnmark.groups).flat().some((p) => p.position.id === cfo.id), show(unmark));
}
