// specs/015-multi-tenant-activation — FR-010/SC-001: org B must never see or touch org A's data.
// Org A is the seeded default org; org B is provisioned fresh each run through the platform tier.
import { call, check, show, login, upload, download, future, platformToken, PDF, RUN } from "./lib.mjs";

const ids = (r) => new Set((Array.isArray(r.json) ? r.json : []).map((x) => x.id));
const none = (r, aIds) => r.status === 200 && ![...aIds].some((id) => ids(r).has(id));
const blocked = (r) => r.status === 404 || r.status === 403;

export default async function ({ tok, me, hire }) {
  // ---- Org A fixtures (seeded default org)
  const aCountBefore = (await call("GET", "/employees", { token: tok.hr })).json.length;
  const aEmp = await hire(`TenantA ${RUN}`, "EMPLOYEE", { managerId: me.manager.employeeId });
  const aDept = (await call("GET", "/departments", { token: tok.hr })).json[0];
  const aType = (await call("GET", "/leave-types", { token: tok.hr })).json[0];
  const aHoliday = (await call("POST", "/holidays", { token: tok.hr, body: { name: `A-Day ${RUN}`, date: future(200) } })).json;
  const aLeave = (await call("POST", "/leave-requests", { token: aEmp.token, body: { leaveTypeId: aType.id, startDate: future(70), endDate: future(70) } })).json;
  const aPost = (await call("POST", "/recruitment/postings", { token: tok.hr, body: { title: `A role ${RUN}`, departmentId: aDept.id, openings: 1 } })).json;
  const aCand = (await call("POST", "/recruitment/candidates", { token: tok.hr, body: { name: `A cand ${RUN}`, email: `acand.${RUN}@example.com`, resumeUrl: "https://files.example.com/a.pdf" } })).json;
  const aApp = (await call("POST", "/recruitment/applications", { token: tok.hr, body: { candidateId: aCand.id, jobPostingId: aPost.id } })).json;
  const aDoc = (await upload(`/documents/employees/${aEmp.id}`, { token: tok.hr, fields: { label: "A secret" }, file: PDF("a-secret") })).json;
  const aSig = (await call("POST", `/documents/${aDoc.id}/signature-requests`, { token: tok.hr, body: { recipientEmployeeId: aEmp.id } })).json;
  const aPol = (await upload("/policies", { token: tok.hr, fields: { title: `A policy ${RUN}` } })).json;
  const aRes = (await call("POST", "/exit/resignations", { token: aEmp.token, body: { proposedLastDay: future(90) } })).json;
  const aComp = (await call("POST", "/statutory/components", { token: tok.hr, body: { name: `A tax ${RUN}`, ruleType: "FLAT", ruleConfig: { amount: 1 }, effectiveFrom: "2099-01-01" } })).json;
  const aAsset = (await call("POST", "/assets", { token: tok.hr, body: { description: "A laptop", identifier: `A-${RUN}` } })).json;
  const aClaim = (await upload("/expenses/claims", { token: aEmp.token, fields: { amount: "10", category: "Internet & phone" } })).json;
  const aGoal = (await call("POST", "/performance/goals", { token: aEmp.token, body: { description: "A goal", targetDate: future(30) } })).json;
  const aNotif = (await call("GET", "/notifications", { token: tok.manager })).json.items?.[0];

  // ---- Provision org B through the platform tier
  const pt = await platformToken();
  check("015 super-admin signs in to the platform tier (FR-005)", typeof pt === "string" && pt.length > 20, String(pt));
  const orgUserOnPlatform = await call("GET", "/platform/organizations", { token: tok.admin });
  const platformOnOrg = await call("GET", "/employees", { token: pt });
  check("015 org tokens can't reach the platform, nor platform tokens the org API", orgUserOnPlatform.status === 401 && platformOnOrg.status === 401, `${orgUserOnPlatform.status}/${platformOnOrg.status}`);
  const prov = await call("POST", "/platform/organizations", { token: pt, body: { name: `Org B ${RUN}`, slug: `b-${RUN}`, adminName: "Bea Admin", adminEmail: `bea.${RUN}@orgb.test` } });
  check("015 operator provisions org B with its first Admin (FR-001)", prov.status === 201 && prov.json.admin?.temporaryPassword, show(prov));
  const B = prov.json.organization;
  const bLogin = await login(`bea.${RUN}@orgb.test`, prov.json.admin.temporaryPassword);
  check("015 org B's Admin signs in immediately (SC-002)", bLogin.status === 200 && bLogin.json.accessToken, show(bLogin));
  const bt = bLogin.json.accessToken;
  const aCountAfter = (await call("GET", "/employees", { token: tok.hr })).json.length;
  check("015 org A unchanged by provisioning (FR-009, SC-004)", aCountAfter === aCountBefore + 1, `${aCountBefore}+1 vs ${aCountAfter}`);

  // ---- Reads: lists never contain A's data; direct lookups are refused (FR-002/003)
  check("015 B's employee list has none of A", none(await call("GET", "/employees", { token: bt }), new Set([aEmp.id, me.hr.employeeId])), "");
  check("015 B can't fetch A's employee by id", blocked(await call("GET", `/employees/${aEmp.id}`, { token: bt })), "");
  check("015 B's directory search has none of A", none(await call("GET", `/employees/directory?q=${encodeURIComponent("TenantA")}`, { token: bt }), new Set([aEmp.id])), "");
  check("015 B's departments/leave types/holidays are its own (FR-004)", none(await call("GET", "/departments", { token: bt }), new Set([aDept.id])) && none(await call("GET", "/leave-types", { token: bt }), new Set([aType.id])) && none(await call("GET", "/holidays", { token: bt }), new Set([aHoliday.id])), "");
  check("015 B can't decide A's leave and sees none in its queue", blocked(await call("POST", `/leave-requests/${aLeave.id}/approve`, { token: bt })) && none(await call("GET", "/leave-requests/queue", { token: bt }), new Set([aLeave.id])), "");
  check("015 B can't read or set A's salary structure", blocked(await call("GET", `/payroll/salary-structures/${aEmp.id}`, { token: bt })) && blocked(await call("POST", `/payroll/salary-structures/${aEmp.id}`, { token: bt, body: { basic: 1, hra: 0, allowances: {}, effectiveFrom: "2026-01-01" } })), "");
  check("015 recruitment: A's posting/candidate/application invisible to B", none(await call("GET", "/recruitment/postings", { token: bt }), new Set([aPost.id])) && blocked(await call("GET", `/recruitment/postings/${aPost.id}`, { token: bt })) && none(await call("GET", "/recruitment/candidates", { token: bt }), new Set([aCand.id])) && blocked(await call("GET", `/recruitment/applications/${aApp.id}`, { token: bt })) && blocked(await call("PATCH", `/recruitment/applications/${aApp.id}/stage`, { token: bt, body: { stage: "SCREEN" } })), "");
  check("015 documents: A's files and signatures unreachable", blocked(await call("GET", `/documents/employees/${aEmp.id}`, { token: bt })) && (await download(`/documents/${aDoc.id}/download`, bt)).status === 404 && blocked(await call("GET", `/documents/signatures/${aSig.id}`, { token: bt })) && none(await call("GET", "/policies", { token: bt }), new Set([aPol.id])) && blocked(await call("GET", `/policies/${aPol.id}/status`, { token: bt })), "");
  check("015 exit: A's resignation unreachable", blocked(await call("GET", `/exit/resignations/${aRes.id}`, { token: bt })) && none(await call("GET", "/exit/resignations", { token: bt }), new Set([aRes.id])), "");
  const bComps = await call("GET", "/statutory/components", { token: bt });
  check("015 statutory components are per org", bComps.status === 200 && !bComps.json.some((c) => c.groupId === aComp.groupId), show(bComps));
  check("015 assets: A's inventory unreachable", none(await call("GET", "/assets", { token: bt }), new Set([aAsset.id])) && blocked(await call("GET", `/assets/${aAsset.id}`, { token: bt })) && blocked(await call("POST", `/assets/${aAsset.id}/assign`, { token: bt, body: { employeeId: bLogin.json.user.employeeId } })), "");
  check("015 expenses: A's claim unreachable", blocked(await call("GET", `/expenses/claims/${aClaim.id}`, { token: bt })) && none(await call("GET", "/expenses/claims/queue", { token: bt }), new Set([aClaim.id])) && !(await call("GET", "/expenses/payouts", { token: bt })).json.outstanding.some((c) => c.id === aClaim.id), "");
  check("015 performance: A's goals/history unreachable", blocked(await call("GET", `/performance/employees/${aEmp.id}/goals`, { token: bt })) && blocked(await call("POST", `/performance/goals/${aGoal.id}/approve`, { token: bt })), "");
  check("015 onboarding: A's checklist unreachable", blocked(await call("GET", `/onboarding/checklists/${aEmp.id}`, { token: bt })) && blocked(await call("POST", `/onboarding/checklists/${aEmp.id}`, { token: bt })), "");
  if (aNotif) check("015 B can't touch A's notification", (await call("POST", `/notifications/${aNotif.id}/read`, { token: bt })).status === 404, "");
  const bHead = await call("GET", "/analytics/headcount", { token: bt });
  check("015 B's analytics count only B (1 admin)", bHead.json.total === 1, show(bHead));

  // ---- Writes with A's identifiers are refused (FR-003)
  const bDept = await call("POST", "/departments", { token: bt, body: { name: aDept.name } });
  check("015 same department name in B is an independent record (edge case)", bDept.status === 201 && bDept.json.id !== aDept.id, show(bDept));
  const bDesig = (await call("GET", "/designations", { token: bt })).json[0];
  check("015 B can't create an employee in A's department", (await call("POST", "/employees", { token: bt, body: { name: "x", email: `x.${RUN}@orgb.test`, departmentId: aDept.id, designationId: bDesig.id, dateOfJoining: "2026-01-01" } })).status === 400, "");
  check("015 B can't make A's employee a manager", (await call("POST", "/employees", { token: bt, body: { name: "y", email: `y.${RUN}@orgb.test`, departmentId: bDept.json.id, designationId: bDesig.id, managerId: aEmp.id, dateOfJoining: "2026-01-01" } })).status === 409, "");
  check("015 B can't edit A's employee", blocked(await call("PATCH", `/employees/${aEmp.id}`, { token: bt, body: { departmentId: bDept.json.id } })), "");
  const bType = (await call("GET", "/leave-types", { token: bt })).json[0];
  if (bType) check("015 B can't file leave for A's employee", blocked(await call("POST", "/leave-requests", { token: bt, body: { leaveTypeId: bType.id, startDate: future(80), endDate: future(80), employeeId: aEmp.id } })), "");
  check("015 B can't post a job into A's department", (await call("POST", "/recruitment/postings", { token: bt, body: { title: "x", departmentId: aDept.id, openings: 1 } })).status === 400, "");
  check("015 B can't upload to A's employee", (await upload(`/documents/employees/${aEmp.id}`, { token: bt, fields: { label: "x" }, file: PDF() })).status === 404, "");
  check("015 B can't exempt A's employee", (await call("POST", "/statutory/exemptions", { token: bt, body: { employeeId: aEmp.id, groupId: aComp.groupId } })).status === 404, "");
  check("015 B can't put A's employee in a review cycle", (await call("POST", "/performance/cycles", { token: bt, body: { name: "x", startDate: "2026-01-01", endDate: "2026-12-31", employeeIds: [aEmp.id] } })).status === 400, "");

  // ---- Payroll independence (US2.1)
  const bRun = await call("POST", "/payroll/runs", { token: bt, body: { periodMonth: 2, periodYear: 2035 } });
  const bSlips = await call("GET", "/payroll/payslips?periodMonth=2&periodYear=2035", { token: bt });
  const bEmployees = new Set((await call("GET", "/employees", { token: bt })).json.map((e) => e.id));
  check("015 B's payroll run touches only B's employees", bRun.status === 200 && bSlips.json.every((p) => bEmployees.has(p.employeeId)), show(bSlips));

  // ---- Same email in two orgs (FR-002 sign-in)
  const shared = `shared.${RUN}@both.test`;
  const inA = await call("POST", "/employees", { token: tok.hr, body: { name: "Shared A", email: shared, departmentId: aDept.id, designationId: (await call("GET", "/designations", { token: tok.hr })).json[0].id, dateOfJoining: "2025-01-01" } });
  const inB = await call("POST", "/employees", { token: bt, body: { name: "Shared B", email: shared, departmentId: bDept.json.id, designationId: bDesig.id, dateOfJoining: "2025-01-01" } });
  const ambiguous = await login(shared, inA.json.temporaryPassword);
  check("015 an email in two orgs needs the organization (ORGANIZATION_REQUIRED)", ambiguous.status === 400 && ambiguous.json.error?.code === "ORGANIZATION_REQUIRED", show(ambiguous));
  const toA = await call("POST", "/auth/login", { body: { email: shared, password: inA.json.temporaryPassword, organization: "default" } });
  const toB = await call("POST", "/auth/login", { body: { email: shared, password: inB.json.temporaryPassword, organization: B.slug } });
  check("015 with the organization, each signs into its own org", toA.json.user?.employeeId === inA.json.id && toB.json.user?.employeeId === inB.json.id, `${show(toA)} | ${show(toB)}`);

  // ---- Super-admin oversight: usage + suspend/reactivate (US3)
  const list = await call("GET", "/platform/organizations", { token: pt });
  const bRow = list.json.find?.((o) => o.id === B.id);
  check("015 operator sees every org with status and usage (FR-006/008)", list.json.some((o) => o.id === "default") && bRow?.status === "ACTIVE" && bRow.usage.activeEmployees === 2 && bRow.usage.lastActivityAt, JSON.stringify(bRow));
  await call("POST", `/platform/organizations/${B.id}/suspend`, { token: pt });
  const bSuspendedToken = await call("GET", "/employees", { token: bt });
  const bSuspendedLogin = await call("POST", "/auth/login", { body: { email: `bea.${RUN}@orgb.test`, password: prov.json.admin.temporaryPassword } });
  const aStillWorks = await call("GET", "/employees", { token: tok.hr });
  check("015 suspension blocks B's live session and sign-in, A unaffected (FR-007, SC-003)", bSuspendedToken.status === 403 && bSuspendedToken.json.error?.code === "ORGANIZATION_SUSPENDED" && bSuspendedLogin.status === 403 && aStillWorks.status === 200, `${bSuspendedToken.status}/${bSuspendedLogin.status}/${aStillWorks.status}`);
  await call("POST", `/platform/organizations/${B.id}/reactivate`, { token: pt });
  const bBack = await call("POST", "/auth/login", { body: { email: `bea.${RUN}@orgb.test`, password: prov.json.admin.temporaryPassword } });
  check("015 reactivation restores access immediately", bBack.status === 200 && bBack.json.accessToken, show(bBack));
}
