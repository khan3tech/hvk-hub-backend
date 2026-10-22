# Implementation Plan: Mobile App / PWA

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

The PWA itself — manifest, service worker, install prompt, responsive screens and the
offline/retry UI (FR-001/004/010) — lives in the **frontend repository**. Mobile check-in, leave
filing and approvals reuse 003's existing endpoints unchanged, so they behave identically to
desktop (FR-002/003).

This backend adds what the mobile channel needs:

- independent per-device sessions (FR-009);
- replay-safe retries through an `Idempotency-Key` header (FR-005, SC-003);
- push-device registration with Web Push delivery of every notification type, deep-linked
  (FR-006/007/008).

## Technical Context

- **New dependency**: `web-push` 3.6.7, used only when `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`
  are set; otherwise a log-only sender.
- **Migration `mobile_pwa`**:
  - RefreshToken `deviceId`;
  - DeviceRegistration `endpoint` (unique), `deviceId`, `lastSeenAt`;
  - new `IdempotencyRecord`.
- **New code**: `src/middleware/idempotency.ts`, `src/lib/push.ts`, and a `devices` module.

## Research & decisions

- **R1 — Device sessions vs 001 FR-013**: 001 ends every other session at sign-in, while 019
  needs independent devices. Resolution: login accepts an optional `deviceId` (stable per
  installed-app instance).
  - **With a deviceId**, a sign-in revokes only that device's earlier session.
  - **Without one** (web), 001's single-session rule applies unchanged. A web sign-in still ends
    device sessions too, keeping 001 Scenario 6 intact.

  Refresh rotation keeps the device, and the MFA challenge carries it. Logout revokes only the
  presented session.
- **R2 — Idempotency (FR-005)**: middleware on every POST/PUT/PATCH/DELETE carrying an
  `Idempotency-Key`.
  - The key is scoped by a hash of the caller's credential, method, path and key, so there's no
    cross-user replay.
  - The first request inserts a unique record. A retry while it's still running gets 409
    `IDEMPOTENCY_IN_PROGRESS`; once it's done, the stored status and body are replayed with
    `Idempotent-Replayed: true`.
  - 5xx responses aren't stored, so the client can genuinely retry them.
  - Records are purged after 24 h by a scheduler job.

  Without a key, the existing conditional transitions still prevent duplicates (409).
- **R3 — Push (FR-006/007/008)**: notifications (006) gained a `setPushDispatcher` hook
  registered in `app.ts`. After the in-app row is written, the event is pushed to each of the
  user's registered subscriptions as `{title, body, url: link, type}`, so tapping opens the
  record. 404/410 responses prune the subscription. Push failures are logged and never affect
  the in-app notification or the triggering action.
- **R4 — Registrations**: one per push endpoint (HTTPS only). Re-registering moves it to the
  current user. Keys are never returned. Removing a device doesn't touch any session (push
  permission and sign-in are independent).

## Constitution Check

I PASS (hooks keep notifications/devices decoupled) · II PASS · III PASS (self-service device
routes) · IV PASS (no domain mutations; idempotency only replays) · VI PASS · VII PASS (no native
apps, no offline queue).
