// specs/013-sso-mfa/quickstart.md, API side. Real TOTP codes are computed here (RFC 6238).
import { createHmac } from "node:crypto";
import { call, check, show, login, RUN } from "./lib.mjs";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32(secret) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of secret) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", b32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}
const stepNow = () => Math.floor(Date.now() / 30000);

export default async function ({ tok, me, hire }) {
  // US3 — voluntary enrollment
  const e = await hire(`MfaUser ${RUN}`);
  const start = await call("POST", "/identity/mfa/enroll", { token: e.token });
  check("013 user starts MFA enrollment (otpauth URL)", start.status === 200 && start.json.otpauthUrl?.startsWith("otpauth://totp/"), show(start));
  const secret = start.json.secret;
  const bad = await call("POST", "/identity/mfa/enroll/confirm", { token: e.token, body: { code: totp(secret, stepNow() + 5) } });
  check("013 enrollment with a non-matching code fails clearly (edge case)", bad.status === 400 && bad.json.error?.code === "INVALID_CODE", show(bad));
  const s = stepNow();
  const ok = await call("POST", "/identity/mfa/enroll/confirm", { token: e.token, body: { code: totp(secret, s) } });
  check("013 enrollment confirmed with a valid code (FR-007)", ok.json.enrolled === true, show(ok));

  const l1 = await login(e.email, e.temporaryPassword);
  check("013 password alone no longer signs in: MFA challenge (FR-008)", l1.status === 200 && l1.json.mfaRequired === true && !l1.json.accessToken && !l1.cookie, show(l1));
  const wrong = await call("POST", "/auth/mfa/verify", { body: { mfaToken: l1.json.mfaToken, code: "000000" } });
  check("013 wrong code refused (SC-004)", wrong.status === 401, show(wrong));
  const good = await call("POST", "/auth/mfa/verify", { body: { mfaToken: l1.json.mfaToken, code: totp(secret, s + 1) } });
  check("013 password + valid code -> session", good.status === 200 && good.json.accessToken && good.cookie, show(good));
  const l2 = await login(e.email, e.temporaryPassword);
  const replay = await call("POST", "/auth/mfa/verify", { body: { mfaToken: l2.json.mfaToken, code: totp(secret, s + 1) } });
  check("013 a used code can't be replayed", replay.status === 401, show(replay));
  let last;
  // The replay was failure 1 since the last success; four more reach the limit of five.
  for (let i = 0; i < 4; i++) last = await call("POST", "/auth/mfa/verify", { body: { mfaToken: l2.json.mfaToken, code: "111111" } });
  check("013 repeated failures lock MFA (FR-011)", last.status === 429 && last.json.error?.code === "MFA_LOCKED", show(last));
  const fakeAccess = await call("GET", "/auth/me", { token: l2.json.mfaToken });
  check("013 an MFA challenge token is not an access token", fakeAccess.status === 401, show(fakeAccess));

  const reset = await call("DELETE", `/identity/mfa/users/${e.userId}`, { token: tok.hr });
  const l3 = await login(e.email, e.temporaryPassword);
  check("013 HR resets MFA; user signs in normally again (FR-010)", reset.status === 204 && l3.json.accessToken, show(l3));
  const empReset = await call("DELETE", `/identity/mfa/users/${e.userId}`, { token: tok.employee });
  check("013 only HR/Admin can reset MFA", empReset.status === 403, show(empReset));

  try {
    // FR-009 — required MFA forces enrollment at next sign-in
    const req = await call("PUT", "/identity/settings", { token: tok.hr, body: { mfaRequired: true } });
    check("013 HR requires MFA company-wide (FR-009)", req.json.mfaRequired === true, show(req));
    const f = await hire(`MfaNew ${RUN}`);
    const lf = await login(f.email, f.temporaryPassword);
    check("013 unenrolled user must enroll before continuing", lf.json.mfaRequired && lf.json.enrollmentRequired === true, show(lf));
    const fs = await call("POST", "/auth/mfa/enroll", { body: { mfaToken: lf.json.mfaToken } });
    const fdone = await call("POST", "/auth/mfa/enroll/confirm", { body: { mfaToken: lf.json.mfaToken, code: totp(fs.json.secret, stepNow()) } });
    check("013 enrolling from the challenge completes sign-in", fdone.status === 200 && fdone.json.accessToken, show(fdone));
    await call("PUT", "/identity/settings", { token: tok.hr, body: { mfaRequired: false } });

    // US1/US2 — SSO configuration and enforcement
    const cfg = await call("PUT", "/identity/settings", { token: tok.hr, body: { provider: "GOOGLE" } });
    check("013 HR configures Google and sees it (US1.3)", cfg.json.provider === "GOOGLE" && cfg.json.providerCredentialsConfigured === false, show(cfg));
    const view = await call("GET", "/identity/settings", { token: tok.employee });
    check("013 identity settings are HR/Admin only", view.status === 403, show(view));
    const noBg = await call("PUT", "/identity/settings", { token: tok.hr, body: { enforced: true } });
    const hadBg = (await call("GET", "/identity/settings", { token: tok.hr })).json.breakGlassAccounts.length > 0;
    check("013 can't enforce SSO without a break-glass Admin (FR-005)", hadBg || (noBg.status === 409 && noBg.json.error?.code === "BREAK_GLASS_REQUIRED"), show(noBg));
    const hrBg = await call("PUT", `/identity/break-glass/${me.hr.id}`, { token: tok.hr, body: { enabled: true } });
    check("013 only Admin designates break-glass", hrBg.status === 403, show(hrBg));
    const bg = await call("PUT", `/identity/break-glass/${me.admin.id}`, { token: tok.admin, body: { enabled: true } });
    check("013 Admin designates a break-glass account", bg.json.breakGlassAccounts?.some((b) => b.userId === me.admin.id), show(bg));
    const enf = await call("PUT", "/identity/settings", { token: tok.hr, body: { enforced: true } });
    check("013 HR enforces SSO (FR-004)", enf.json.enforced === true, show(enf));
    const blocked = await login("employee@teamloom.dev");
    check("013 regular password sign-in refused with SSO guidance (SC-003)", blocked.status === 403 && blocked.json.error?.code === "SSO_REQUIRED", show(blocked));
    const breakGlass = await login("admin@teamloom.dev");
    check("013 break-glass Admin still signs in with password (SC-005)", breakGlass.status === 200 && breakGlass.json.accessToken, show(breakGlass));
    const sso = await call("GET", "/auth/sso/start?redirect=false");
    check("013 SSO start reports missing server credentials clearly", sso.status === 503 && sso.json.error?.code === "SSO_NOT_CONFIGURED", show(sso));
  } finally {
    const off = await call("PUT", "/identity/settings", { token: tok.hr, body: { enforced: false, provider: null, mfaRequired: false } });
    check("013 disabling enforcement restores password sign-in (FR-006)", off.json.enforced === false && (await login("employee@teamloom.dev")).status === 200, show(off));
  }
}
