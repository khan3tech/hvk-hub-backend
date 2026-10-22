// specs/019-mobile-pwa/quickstart.md, API side (installability/layout live in the frontend repo).
import { call, check, show, login, future, API, RUN } from "./lib.mjs";

const loginOn = (email, password, deviceId) => call("POST", "/auth/login", { body: { email, password, ...(deviceId ? { deviceId } : {}) } });
const refresh = (cookie) => call("POST", "/auth/refresh", { cookie });

export default async function ({ tok, hire }) {
  const mgr = await hire(`MobMgr ${RUN}`, "MANAGER");
  const e = await hire(`MobEmp ${RUN}`, "EMPLOYEE", { managerId: mgr.id });

  // FR-009: independent device sessions
  const phone = await loginOn(e.email, e.temporaryPassword, `phone-${RUN}`);
  const tablet = await loginOn(e.email, e.temporaryPassword, `tablet-${RUN}`);
  // Each refresh rotates the cookie, so follow the chain.
  const phone2 = await refresh(phone.cookie);
  check("019 two devices sign in independently (FR-009)", phone.cookie && tablet.cookie && phone2.status === 200, show(phone2));
  await call("POST", "/auth/logout", { token: tablet.json.accessToken, cookie: tablet.cookie });
  const phoneAfter = await refresh(phone2.cookie);
  const tabletAfter = await refresh(tablet.cookie);
  check("019 signing out of one device leaves the other signed in", phoneAfter.status === 200 && tabletAfter.status === 401, `${phoneAfter.status}/${tabletAfter.status}`);
  const phoneAgain = await loginOn(e.email, e.temporaryPassword, `phone-${RUN}`);
  check("019 re-signing in on the same device replaces only that device's session", (await refresh(phoneAfter.cookie)).status === 401 && phoneAgain.status === 200, "");
  const web = await login(e.email, e.temporaryPassword);
  check("019 a web sign-in keeps 001's single-session rule", web.status === 200 && (await refresh(phoneAgain.cookie)).status === 401, "");
  const token = web.json.accessToken;

  // FR-005/SC-003: retried requests act once
  const types = (await call("GET", "/leave-types", { token })).json;
  const key = `leave-${RUN}`;
  const body = { leaveTypeId: types[0].id, startDate: future(100), endDate: future(100) };
  const first = await call("POST", "/leave-requests", { token, body, headers: { "Idempotency-Key": key } });
  const retry = await call("POST", "/leave-requests", { token, body, headers: { "Idempotency-Key": key } });
  const mine = (await call("GET", "/leave-requests/me", { token })).json.filter((r) => r.startDate.startsWith(future(100)));
  check("019 a retried leave filing with the same key creates one request", first.status === 201 && retry.status === 201 && retry.json.id === first.json.id && mine.length === 1, `${show(retry)} count=${mine.length}`);
  const approve = () => call("POST", `/leave-requests/${first.json.id}/approve`, { token: mgr.token, headers: { "Idempotency-Key": `approve-${RUN}` } });
  const a1 = await approve();
  const a2 = await approve();
  check("019 a retried approval replays the first result instead of failing (US2.3)", a1.status === 200 && a2.status === 200 && a2.json.status === "APPROVED", `${a1.status}/${a2.status}`);
  const fresh = await call("POST", `/leave-requests/${first.json.id}/approve`, { token: mgr.token });
  check("019 without a key, a second approval is still refused (no duplicate effect)", fresh.status === 409, show(fresh));
  const otherUser = await call("POST", "/leave-requests", { token: mgr.token, body, headers: { "Idempotency-Key": key } });
  check("019 keys are scoped per caller (no cross-user replay)", otherUser.status === 201 && otherUser.json.id !== first.json.id, show(otherUser));

  // US3: push devices
  const cfg = await call("GET", "/devices/push-config", { token });
  check("019 push config reports whether push is enabled", cfg.status === 200 && typeof cfg.json.enabled === "boolean", show(cfg));
  const sub = { endpoint: `https://push.example.test/${RUN}`, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } };
  const reg = await call("POST", "/devices", { token, body: { subscription: sub, platform: "android-chrome", deviceId: `phone-${RUN}` } });
  check("019 device registered without echoing its keys", reg.status === 201 && !("pushToken" in reg.json), show(reg));
  const insecure = await call("POST", "/devices", { token, body: { subscription: { ...sub, endpoint: "http://insecure.test/x" }, platform: "x" } });
  check("019 non-HTTPS push endpoints rejected", insecure.status === 400, show(insecure));
  const theirs = await call("DELETE", `/devices/${reg.json.id}`, { token: mgr.token });
  check("019 another user can't remove your device", theirs.status === 404, show(theirs));
  const del = await call("DELETE", `/devices/${reg.json.id}`, { token });
  const stillIn = await call("GET", "/auth/me", { token });
  check("019 removing a device doesn't touch the session (FR-008)", del.status === 204 && stillIn.status === 200, `${del.status}/${stillIn.status}`);
  void API;
}
