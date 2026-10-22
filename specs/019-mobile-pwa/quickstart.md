# Quickstart: Validate Mobile / PWA support (backend)

```bash
npm run dev && node scripts/e2e/run-all.mjs 019
node scripts/e2e-001-auth.mjs   # 001's single-session rule still holds for web sign-ins
```

1. An employee signs in on a "phone" and a "tablet" (different `deviceId`s). Both refresh
   independently, and signing out of the tablet leaves the phone signed in. Signing in again on
   the phone replaces only the phone's session. A web sign-in ends device sessions (001).
2. Filing leave twice with the same `Idempotency-Key` creates one request. Approving twice with a
   key replays 200 instead of failing. Without a key, the second approval is still a 409. The
   same key from another user is independent.
3. `GET /devices/push-config` reports push status. Registering a subscription returns no keys;
   `http://` endpoints are rejected. Another user can't delete your device, and deleting it
   leaves your session intact.
4. Push fan-out, pruning and failure isolation are covered by `devices/service.test.ts` and
   `notifications/service.test.ts`. Set the VAPID env vars to deliver to real browsers.
5. Installability, the service worker, mobile layouts and retry UI are validated in the frontend
   repo.
