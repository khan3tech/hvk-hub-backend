// Shared helpers for the per-feature end-to-end scripts in scripts/e2e/ (run against a live API
// with a migrated, seeded database). Each script default-exports an async function(ctx).
export const API = process.env.API_URL ?? "http://localhost:4000/api";
export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "Password123!";
export const RUN = Date.now().toString(36);

const results = [];
export function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + detail}`);
}
export function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  return failed.length;
}
export const show = (r) => `${r.status} ${JSON.stringify(r.json)}`.slice(0, 400);

export async function call(method, path, { token, body, cookie, headers } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
      ...(headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  const m = (res.headers.get("set-cookie") ?? "").match(/refreshToken=([^;]*)/);
  return { status: res.status, json, cookie: m ? `refreshToken=${m[1]}` : undefined };
}

export const login = (email, password = SEED_PASSWORD) => call("POST", "/auth/login", { body: { email, password } });

export const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

// Signs in the four seeded roles and returns { tok, me, hire } for a script to use.
export async function setup() {
  const tok = {};
  const me = {};
  for (const role of ["admin", "hr", "manager", "employee"]) {
    const r = await login(`${role}@hvk.in`);
    if (r.status !== 200) throw new Error(`seeded ${role} login failed: ${show(r)}`);
    tok[role] = r.json.accessToken;
    me[role] = (await call("GET", "/auth/me", { token: tok[role] })).json;
  }
  const depts = (await call("GET", "/departments", { token: tok.hr })).json;
  const desigs = (await call("GET", "/designations", { token: tok.hr })).json;

  async function department(name) {
    const existing = (await call("GET", "/departments", { token: tok.hr })).json.find((d) => d.name === name);
    if (existing) return existing;
    return (await call("POST", "/departments", { token: tok.hr, body: { name } })).json;
  }

  // Creates a fresh employee (unique per run) and signs them in.
  async function hire(name, role = "EMPLOYEE", opts = {}) {
    const r = await call("POST", "/employees", {
      token: tok.hr,
      body: {
        name,
        email: `${name.toLowerCase().replace(/\W/g, "")}.${RUN}@hvk.in`,
        departmentId: opts.departmentId ?? depts[0].id,
        designationId: desigs[0].id,
        managerId: opts.managerId ?? null,
        dateOfJoining: opts.dateOfJoining ?? "2025-01-01",
        role,
      },
    });
    if (r.status !== 201) throw new Error("hire failed " + show(r));
    const l = await login(r.json.email, r.json.temporaryPassword);
    return { ...r.json, token: l.json.accessToken, cookie: l.cookie, userId: l.json.user?.id };
  }

  return { tok, me, depts, desigs, hire, department };
}

// Multipart upload: fields is a plain object; file is { bytes: Buffer|string, name, type }.
export async function upload(path, { token, fields = {}, file }) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  if (file) form.append("file", new Blob([file.bytes], { type: file.type }), file.name);
  const res = await fetch(API + path, { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: form });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

export const PDF = (label = "doc") => ({ bytes: Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF\n`), name: `${label}.pdf`, type: "application/pdf" });

export async function download(path, token) {
  const res = await fetch(API + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") };
}

// One platform (super-admin) sign-in per run — its login is rate-limited.
let platformTokenPromise;
export function platformToken() {
  platformTokenPromise ??= call("POST", "/platform/auth/login", { body: { email: process.env.SUPER_ADMIN_EMAIL ?? "platform@hvk.in", password: process.env.SUPER_ADMIN_PASSWORD ?? SEED_PASSWORD } }).then((r) => {
    if (r.status !== 200) throw new Error("platform login failed: " + show(r));
    return r.json.accessToken;
  });
  return platformTokenPromise;
}
