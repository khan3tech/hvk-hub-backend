# Quickstart: Activity & Presence validation

**Prerequisites**: same as 028 (migrated + seeded DB, API on :4000). Seed users `admin@`, `hr@`, `manager@`, `employee@hvk.in` (employee reports to manager).

1. **Heartbeat (US1)**: as `employee@`, POST `/activity/heartbeat {state:"ACTIVE"}` → 202 `recorded:true`, presence ACTIVE. Repeat immediately → `recorded:false` (throttle).
2. **Presence (US2)**: `manager@` GET `/activity/presence` → includes employee ACTIVE and self; `employee@` → only self. After an IDLE report → AWAY.
3. **Timeline (US3)**: `employee@` GET `/activity/timeline` → spans with ACTIVE then IDLE; totals add up. `manager@` for employee → 200; `employee@` for manager → 403. `manager@` GET `/activity/team` → employee row; `employee@` → 403.
4. **Settings (US5)**: `employee@` PUT `/activity/settings` → 403. `hr@` PUT `{enabled:false}` → heartbeats return `recorded:false` and presence is OFFLINE; PUT `{enabled:true, idleThresholdMinutes:10}` → GET shows 10.
5. **Timer trim (US4)**: start a 028 timer, POST `/time/timer/trim {minutes:5}` → `startedAt` 5 min later (or now if the timer is younger). No timer → 404 `NO_TIMER`.
6. **Merge rules**: unit-level: same state within 150 s extends; a change within 150 s starts at the previous end; after a gap > 150 s a new span starts at report time.
