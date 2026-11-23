# Research: Activity & Presence

- **R1 — Where detection happens**
  - Decision: the browser decides the state and reports it.
    - System-wide: the Idle Detection API (`IdleDetector`, Chromium, permission-gated) gives `userState` active|idle and `screenState` locked|unlocked, with the org threshold.
    - Fallback: pointer, keyboard, scroll and focus events in Hvk Hub plus `document.visibilityState`, using the same threshold.
  - The server never infers "active" on its own; it only stores what's reported.
  - Alternatives: a desktop agent, out of scope (user choice).

- **R2 — Storage shape (FR-002)**
  - Decision: stretches (`ActivitySpan`: state, startedAt, endedAt), not per-minute samples.
  - Each heartbeat updates the latest span in O(1):
    - same state and `now − endedAt ≤ 150 s` → extend `endedAt = now`;
    - different state within 150 s → close the old span at its `endedAt` and open the new one from there;
    - otherwise → open a new span at `now`.
  - Rationale: about 10–40 rows per employee per day instead of 480, and timelines are just the rows.

- **R3 — Trust (edge "clock tampering")**
  - Decision: the client sends only `{state}`; the server timestamps it.
  - Reports less than 20 s after the presence row's `lastSeenAt` are ignored and return 202, which also merges multiple tabs and devices.

- **R4 — Presence (FR-004)**
  - Decision: one `ActivityPresence` row per employee: state and lastSeenAt. Status is computed on read: within 150 s → ACTIVE, or AWAY if the state was IDLE or LOCKED; otherwise OFFLINE.
  - When tracking is disabled, presence is OFFLINE for everyone (FR-009).

- **R5 — Day totals (FR-006)**
  - Decision: org-local day bounds come from `ORG_TIME_ZONE` (028). Asia/Kolkata has no DST, so a day is `[date 00:00 IST, +24h)` = `[date−1 18:30Z, date 18:30Z)`.
  - Spans overlapping the day are clipped to it; minutes are rounded per total, not per span.

- **R6 — Timer trim (FR-010)**
  - Decision: `trimTimer(minutes)` sets `startedAt = min(startedAt + minutes, now)` on the caller's own running timer. 404 `NO_TIMER` when there isn't one.

- **R7 — Retention (FR-011)**
  - Decision: an hourly scheduled job deletes `ActivitySpan` where `endedAt < now − 90 days`. Presence rows are kept, since they hold only the latest state.

- **R8 — Settings (FR-008)**
  - Decision: an `ActivitySettings` row per org, created lazily with defaults `{enabled: true, idleThresholdMinutes: 5}`. GET is open to any signed-in user, because clients need the threshold; PUT is HR/Admin only.
