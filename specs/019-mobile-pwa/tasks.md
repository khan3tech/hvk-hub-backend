# Tasks: Mobile App / PWA (backend part)

**Input**: plan.md, contracts/mobile-api.md, quickstart.md. UI work (FR-001/004/010) is in the frontend repo.

- [X] T001 Add `web-push`; migration `mobile_pwa` (RefreshToken.deviceId, DeviceRegistration endpoint/deviceId/lastSeenAt, IdempotencyRecord)
- [X] T002 US1/US2: per-device sessions via optional login `deviceId`; 001 rule kept for web sign-ins (FR-009)
- [X] T003 US2: `Idempotency-Key` middleware + 24 h purge job (FR-005, SC-003)
- [X] T004 US3: device registration API (HTTPS endpoints, keys never returned)
- [X] T005 US3: push dispatcher hook in notifications; Web Push sender with pruning (FR-006/007/008)
- [X] T006 Unit tests (3 devices + 1 notifications); `scripts/e2e/019-mobile.mjs` (13 checks); 001 suite re-run 43/43
- [ ] T007 Frontend repo: manifest, service worker (push → open `url`), install prompt, mobile layouts, offline/retry UI
