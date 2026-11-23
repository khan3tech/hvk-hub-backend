# Tasks: Activity & Presence

**Input**: plan.md, research.md, data-model.md, contracts/activity-api.md. Backend only (frontend repo owns detection and UI).

## Phase 1: Setup
- [X] T001 Prisma `ActivitySpan`, `ActivityPresence`, `ActivitySettings` + enum `ActivityState`; migration `activity_presence`

## Phase 2: US1/US5 — Heartbeat & settings (P1/P3)
- [X] T002 Settings get/update with lazy defaults (enabled, 5 min)
- [X] T003 Heartbeat: active-employee check, disabled → not stored, 20 s throttle (state changes always recorded), span merge rules (R2), presence upsert — one transaction

## Phase 3: US2 — Presence (P1)
- [X] T004 Presence status (ACTIVE/AWAY/OFFLINE, 150 s window), scoped list sorted by status

## Phase 4: US3 — Timeline & team (P2)
- [X] T005 Org-local day bounds, clip + summarize spans, timeline (scoped) and team day view

## Phase 5: US4 — Timer trim (P2)
- [X] T006 `POST /api/time/timer/trim` in 028: move start later, capped at now

## Phase 6: Wiring & polish
- [X] T007 controller + routes + OpenAPI; mount `/api/activity`; hourly 90-day retention job
- [ ] T008 (deferred — tests postponed by the user; verified manually: 27/27 quickstart checks + 028's 52/52 regression on a fresh DB) unit tests for `mergeDecision`, `presenceStatus`, `summarize`, `dayBounds`; `scripts/e2e/029-activity.mjs`
