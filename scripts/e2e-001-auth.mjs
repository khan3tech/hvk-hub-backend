// End-to-end run of specs/001-auth-rbac/quickstart.md against a live API + seeded Postgres.
// Usage: npm run seed && npm run dev, then `node scripts/e2e-001-auth.mjs` (API_URL overrides the target).
// Creates fresh employees per run so it is repeatable; seeded logins are rate-limited to 10 per 15 min.
const API = process.env.API_URL ?? "http://localhost:4000/api";
const PW = "Password123!";
const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + detail}`);
};

async function call(method, path, { token, body, cookie } = {}) {
  const t0 = Date.now();
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/refreshToken=([^;]*)/);
  return { status: res.status, json, cookie: m ? `refreshToken=${m[1]}` : undefined, ms: Date.now() - t0 };
}
const login = (email, password = PW) => call("POST", "/auth/login", { body: { email, password } });
const msgOk = (r) => typeof r.json?.error?.message === "string" && r.json.error.message.length > 5 && !/prisma|stack|undefined|exception/i.test(r.json.error.message);

const run = Date.now().toString(36);
const today = new Date();
const future = (days) => new Date(today.getTime() + days * 864e5).toISOString().slice(0, 10);

// ---- Setup: tokens for seeded roles
const tok = {};
for (const role of ["admin", "hr", "manager", "employee"]) {
  const r = await login(`${role}@teamloom.dev`);
  check(`S1 seeded ${role} signs in (${r.ms}ms, SC-001 <5s)`, r.status === 200 && r.json.accessToken && r.ms < 5000, JSON.stringify(r.json));
  tok[role] = r.json.accessToken;
  check(`S1 ${role} login sets refresh cookie`, !!r.cookie);
}
const me = {};
for (const role of Object.keys(tok)) {
  const r = await call("GET", "/auth/me", { token: tok[role] });
  check(`S1 /auth/me returns ${role.toUpperCase()} role`, r.status === 200 && r.json.role === role.toUpperCase(), JSON.stringify(r.json));
  me[role] = r.json;
}

// ---- Scenario 1: generic invalid credentials
const wrong = await login("manager@teamloom.dev", "nope-wrong-1");
const nobody = await login("nobody@example.com", "whatever-123");
check("S1 wrong password -> 401 INVALID_CREDENTIALS", wrong.status === 401 && wrong.json.error?.code === "INVALID_CREDENTIALS", JSON.stringify(wrong.json));
check("S1 unknown email gives identical response", nobody.status === wrong.status && JSON.stringify(nobody.json) === JSON.stringify(wrong.json), JSON.stringify(nobody.json));
check("S1/SC-004 message is non-technical", msgOk(wrong), JSON.stringify(wrong.json));

// Helpers to create fresh employees (keeps the run repeatable)
const depts = (await call("GET", "/departments", { token: tok.hr })).json;
const desigs = (await call("GET", "/designations", { token: tok.hr })).json;
async function hire(name, role, managerId = null) {
  const r = await call("POST", "/employees", {
    token: tok.hr,
    body: { name, email: `${name.toLowerCase().replace(/\W/g, "")}.${run}@teamloom.dev`, departmentId: depts[0].id, designationId: desigs[0].id, managerId, dateOfJoining: "2025-01-01", role },
  });
  if (r.status !== 201) throw new Error("hire failed " + JSON.stringify(r.json));
  const l = await login(r.json.email, r.json.temporaryPassword);
  return { ...r.json, token: l.json.accessToken, cookie: l.cookie, userId: l.json.user?.id };
}

// ---- Scenario 2: session renewal (API side)
{
  const e = await hire("Sess", "EMPLOYEE", me.manager.employeeId);
  const r1 = await call("POST", "/auth/refresh", { cookie: e.cookie });
  check("S2 refresh with valid cookie -> 200 + new access token", r1.status === 200 && r1.json.accessToken, JSON.stringify(r1.json));
  const r2 = await call("GET", "/auth/me", { token: r1.json.accessToken });
  check("S2 refreshed access token works", r2.status === 200);
  const r3 = await call("POST", "/auth/refresh", { cookie: r1.cookie });
  check("S2 rotated cookie keeps renewing (no forced sign-out, SC-003)", r3.status === 200, JSON.stringify(r3.json));
  const r4 = await call("POST", "/auth/refresh", {});
  check("S2 no cookie (expired) -> 401 INVALID_SESSION", r4.status === 401 && r4.json.error?.code === "INVALID_SESSION", JSON.stringify(r4.json));
  const r5 = await call("GET", "/auth/me", { token: "garbage.token.value" });
  check("S2 invalid/expired access token -> 401", r5.status === 401, JSON.stringify(r5.json));
}

// ---- Scenario 3: RBAC
{
  const other = await call("GET", `/employees/${me.manager.employeeId}`, { token: tok.employee });
  check("S3 Employee fetching another's full profile -> 403", other.status === 403, `${other.status} ${JSON.stringify(other.json)}`);
  check("S3/SC-004 403 message non-technical", msgOk(other), JSON.stringify(other.json));
  const slips = await call("GET", "/payroll/payslips", { token: tok.employee });
  check("S3 Employee org-wide payslips -> 403", slips.status === 403);
  const sal = await call("GET", `/payroll/salary-structures/${me.manager.employeeId}`, { token: tok.employee });
  check("S3 Employee another's salary structure -> 403", sal.status === 403, `${sal.status} ${JSON.stringify(sal.json)}`);
  const payrollRun = await call("POST", "/payroll/runs", { token: tok.manager, body: { periodMonth: 1, periodYear: 2026 } });
  check("S3 Manager triggering payroll -> 403", payrollRun.status === 403, `${payrollRun.status}`);
  const create = await call("POST", "/employees", { token: tok.employee, body: {} });
  check("S3 Employee creating an employee -> 403", create.status === 403, `${create.status}`);

  const m2 = await hire("MgrTwo", "MANAGER");
  const e2 = await hire("ReportTwo", "EMPLOYEE", m2.id);
  const types = (await call("GET", "/leave-types", { token: e2.token })).json;
  const lr = await call("POST", "/leave-requests", { token: e2.token, body: { leaveTypeId: types[0].id, startDate: future(30), endDate: future(30) } });
  check("S3 setup: second manager's report files leave", lr.status === 201, `${lr.status} ${JSON.stringify(lr.json)}`);
  const reqId = lr.json?.id ?? lr.json?.request?.id;
  if (reqId) {
    const ap = await call("POST", `/leave-requests/${reqId}/approve`, { token: tok.manager });
    check("S3 Manager approving a non-report's leave -> 403", ap.status === 403, `${ap.status} ${JSON.stringify(ap.json)}`);
    const ap2 = await call("POST", `/leave-requests/${reqId}/approve`, { token: m2.token });
    check("S3 their own manager can approve -> 200", ap2.status === 200, `${ap2.status} ${JSON.stringify(ap2.json)}`);
  }
}

// ---- Scenario 4: lockout + unlock
{
  const e = await hire("Locky", "EMPLOYEE", me.manager.employeeId);
  for (let i = 0; i < 3; i++) await login(e.email, "wrong-password-x");
  const locked = await login(e.email, e.temporaryPassword);
  check("S4 correct password after 3 failures -> 403 ACCOUNT_LOCKED", locked.status === 403 && locked.json.error?.code === "ACCOUNT_LOCKED", `${locked.status} ${JSON.stringify(locked.json)}`);
  check("S4/SC-004 lockout message non-technical", msgOk(locked));
  const byEmp = await call("POST", `/auth/${e.userId}/unlock`, { token: tok.employee });
  check("S4 Employee unlock -> 403 FORBIDDEN", byEmp.status === 403 && byEmp.json.error?.code === "FORBIDDEN", `${byEmp.status}`);
  const byMgr = await call("POST", `/auth/${e.userId}/unlock`, { token: tok.manager });
  check("S4 Manager unlock -> 403 FORBIDDEN", byMgr.status === 403, `${byMgr.status}`);
  const byAdmin = await call("POST", `/auth/${e.userId}/unlock`, { token: tok.admin });
  check("S4 Admin unlock -> 200", byAdmin.status === 200, `${byAdmin.status} ${JSON.stringify(byAdmin.json)}`);
  const again = await login(e.email, e.temporaryPassword);
  check("S4 unlocked user signs in normally", again.status === 200, `${again.status} ${JSON.stringify(again.json)}`);
}

// ---- Scenario 5: offboarding revokes access
{
  const e = await hire("Leaver", "EMPLOYEE", me.manager.employeeId);
  const before = await call("GET", "/auth/me", { token: e.token });
  check("S5 active session works before offboarding", before.status === 200);
  const off = await call("POST", `/employees/${e.id}/offboard`, { token: tok.admin });
  check("S5 Admin offboards employee", off.status === 200, `${off.status} ${JSON.stringify(off.json)}`);
  const after = await call("GET", "/auth/me", { token: e.token });
  check("S5 existing access token refused after offboarding", after.status === 401 || after.status === 403, `${after.status}`);
  const ref = await call("POST", "/auth/refresh", { cookie: e.cookie });
  check("S5 refresh token revoked after offboarding", ref.status === 401, `${ref.status} ${JSON.stringify(ref.json)}`);
  const relog = await login(e.email, e.temporaryPassword);
  check("S5 offboarded user cannot sign in", relog.status === 401, `${relog.status}`);
}

// ---- Scenario 6: single active session
{
  const e = await hire("TwoDevices", "EMPLOYEE", me.manager.employeeId);
  const a = { cookie: e.cookie };
  const b = await login(e.email, e.temporaryPassword);
  check("S6 sign-in on device B succeeds", b.status === 200);
  const ra = await call("POST", "/auth/refresh", { cookie: a.cookie });
  check("S6 device A refresh -> 401 INVALID_SESSION", ra.status === 401 && ra.json.error?.code === "INVALID_SESSION", `${ra.status} ${JSON.stringify(ra.json)}`);
  const rb = await call("POST", "/auth/refresh", { cookie: b.cookie });
  check("S6 device B refresh -> 200", rb.status === 200, `${rb.status}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
