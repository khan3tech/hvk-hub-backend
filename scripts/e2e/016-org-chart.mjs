// specs/016-org-chart-visualization/quickstart.md, API side. Runs in a fresh organization so the
// tree shape is exact (the default org accumulates employees from other e2e runs).
import { call, check, show, login, platformToken, RUN } from "./lib.mjs";

export default async function () {
  const pt = await platformToken();
  const prov = (await call("POST", "/platform/organizations", { token: pt, body: { name: `Chart Co ${RUN}`, slug: `chart-${RUN}`, adminName: "Cara Ceo", adminEmail: `ceo.${RUN}@chart.test` } })).json;
  const ceo = { id: prov.admin.employeeId, token: (await login(`ceo.${RUN}@chart.test`, prov.admin.temporaryPassword)).json.accessToken };
  const dept = (await call("GET", "/departments", { token: ceo.token })).json[0];
  const desig = (await call("GET", "/designations", { token: ceo.token })).json[0];
  async function add(name, role, managerId) {
    const r = await call("POST", "/employees", { token: ceo.token, body: { name, email: `${name.toLowerCase().replace(/\W/g, "")}.${RUN}@chart.test`, departmentId: dept.id, designationId: desig.id, managerId, dateOfJoining: "2025-01-01", role } });
    return { ...r.json, token: (await login(r.json.email, r.json.temporaryPassword)).json.accessToken };
  }
  const hr = await add("Hana Hr", "HR", ceo.id);
  const mgr = await add("Manu Mgr", "MANAGER", ceo.id);
  const dev1 = await add("Devi One", "EMPLOYEE", mgr.id);
  const dev2 = await add("Devo Two", "EMPLOYEE", mgr.id);
  const stray = await add("Stray Sam", "EMPLOYEE", null);

  await call("PUT", "/org-chart/top", { token: hr.token, body: { employeeId: ceo.id } });

  // US1
  const chart = await call("GET", "/org-chart?depth=1", { token: dev1.token });
  const root = chart.json.roots?.[0];
  check("016 chart rooted at the designated top, from live reporting lines (FR-001)", chart.status === 200 && root?.id === ceo.id && chart.json.totalEmployees === 6, show(chart));
  const mgrNode = root.children?.find((c) => c.id === mgr.id);
  check("016 shallow by default: manager has reports but they load lazily (FR-006)", mgrNode?.hasChildren && mgrNode.directReportCount === 2 && !mgrNode.children, JSON.stringify(mgrNode));
  check("016 the caller's path is returned for centering (US1.4)", JSON.stringify(chart.json.myPath) === JSON.stringify([ceo.id, mgr.id, dev1.id]), JSON.stringify(chart.json.myPath));
  const kids = await call("GET", `/org-chart/nodes/${mgr.id}/children`, { token: dev1.token });
  check("016 expanding a branch returns its reports; leaves have no expand (FR-002)", kids.json.length === 2 && kids.json.every((k) => k.hasChildren === false), show(kids));
  const peer = kids.json.find((k) => k.id === dev2.id);
  check("016 an employee sees directory fields, not a peer's email or HR flags (FR-003)", peer.name === "Devo Two" && peer.title && !("email" in peer) && !("orphan" in peer), JSON.stringify(peer));
  const mgrView = (await call("GET", `/org-chart/nodes/${mgr.id}/children`, { token: mgr.token })).json.find((k) => k.id === dev2.id);
  check("016 a manager sees their report's email", mgrView.email?.includes("devotwo"), JSON.stringify(mgrView));

  // US2
  const found = await call("GET", "/org-chart/search?q=devo", { token: stray.token });
  check("016 search finds the person with the path to expand (FR-004)", found.json.length === 1 && JSON.stringify(found.json[0].path) === JSON.stringify([ceo.id, mgr.id, dev2.id]), show(found));
  const nothing = await call("GET", "/org-chart/search?q=zzzz", { token: stray.token });
  check("016 no matches -> clear empty result", nothing.status === 200 && Array.isArray(nothing.json) && nothing.json.length === 0, show(nothing));

  // US3
  const hrChart = await call("GET", "/org-chart?depth=0", { token: hr.token });
  const strayRoot = hrChart.json.roots.find((r) => r.id === stray.id);
  check("016 HR sees the manager-less employee flagged as orphan, the top isn't", strayRoot?.orphan === true && hrChart.json.roots.find((r) => r.id === ceo.id)?.orphan === false, show(hrChart));
  const gaps1 = await call("GET", "/org-chart/gaps", { token: hr.token });
  check("016 gaps list the orphan and the headless department (FR-008)", gaps1.json.orphans.some((o) => o.id === stray.id) && gaps1.json.headlessDepartments.some((d) => d.id === dept.id), show(gaps1));
  await call("PATCH", `/departments/${dept.id}`, { token: hr.token, body: { headEmployeeId: mgr.id } });
  const gaps2 = await call("GET", "/org-chart/gaps", { token: hr.token });
  check("016 assigning a head clears the headless flag", !gaps2.json.headlessDepartments.some((d) => d.id === dept.id), show(gaps2));
  const empGaps = await call("GET", "/org-chart/gaps", { token: dev1.token });
  check("016 the gap overlay is HR/Admin only", empGaps.status === 403, show(empGaps));

  // Edge case: offboarding removes the person; their reports surface as orphans
  await call("POST", `/employees/${mgr.id}/offboard`, { token: hr.token });
  const after = await call("GET", "/org-chart?depth=3", { token: hr.token });
  const ids = JSON.stringify(after.json);
  const gaps3 = await call("GET", "/org-chart/gaps", { token: hr.token });
  check("016 offboarded people leave the chart; their reports become orphans (FR-005)", !ids.includes(mgr.id) && after.json.roots.some((r) => r.id === dev1.id && r.orphan) && gaps3.json.orphans.some((o) => o.id === dev2.id && o.reason === "MANAGER_OFFBOARDED_OR_MISSING") && gaps3.json.headlessDepartments.some((d) => d.id === dept.id && d.reason === "HEAD_OFFBOARDED"), show(gaps3));
}
