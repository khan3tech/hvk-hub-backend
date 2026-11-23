# Contract: Activity & Presence API (`/api/activity`): authenticated

Errors use `{ error: { code, message, fields? } }`. Timestamps are ISO-8601 UTC; dates are `YYYY-MM-DD` (org-local, Asia/Kolkata).

## Shapes
```ts
Settings   { enabled: boolean, idleThresholdMinutes: number /* 1–60 */ }
Presence   { employeeId, employeeName, status: "ACTIVE"|"AWAY"|"OFFLINE", state: "ACTIVE"|"IDLE"|"LOCKED"|null, lastSeenAt: string|null }
Span       { state: "ACTIVE"|"IDLE"|"LOCKED", startedAt, endedAt, minutes }
DaySummary { activeMinutes, awayMinutes, firstActiveAt: string|null, lastActiveAt: string|null }
Timeline   { employeeId, employeeName, date, spans: Span[], summary: DaySummary }
TeamRow    { employeeId, employeeName, status, lastSeenAt, ...DaySummary }
```

## Endpoints
| Method & path | Roles | Notes / errors |
|---|---|---|
| POST `/heartbeat` | any employee | `{state: "ACTIVE"\|"IDLE"\|"LOCKED"}` → **202** `{recorded: boolean, presence: Presence\|null, settings: Settings}`. `recorded:false` when throttled (<20 s) or tracking disabled. 403 `EMPLOYEE_INACTIVE`, 403 `NO_EMPLOYEE_RECORD` |
| GET `/settings` | any | → `Settings` |
| PUT `/settings` | ADMIN, HR | `{enabled?, idleThresholdMinutes?}` → `Settings` |
| GET `/presence` | any (scoped) | Employee: self; Manager: self + direct reports; HR/Admin: all active employees → `Presence[]` (sorted Active, Away, Offline, then name) |
| GET `/timeline?employeeId&date` | any (scoped) | defaults: self, today → `Timeline`; 403 `FORBIDDEN` out of scope |
| GET `/team?date` | MANAGER (direct reports), ADMIN/HR (all active) | → `TeamRow[]` |

## Addition to 028 (`/api/time`)
| Method & path | Roles | Notes |
|---|---|---|
| POST `/timer/trim` | any employee | `{minutes: 1–1440}` → `{timer: Timer}`; moves the running timer's start later by `minutes` (never past now); 404 `NO_TIMER` |

## Client behaviour (frontend)
- **Settings and permission:** load `GET /settings` at sign-in. If `enabled`, show the tracking notice once (FR-013). On Chromium, offer "allow system-wide idle detection" (`IdleDetector.requestPermission()`).
- **States:**
  - with permission: `IdleDetector` with `threshold = idleThresholdMinutes × 60 000` ms; `screenState === "locked"` → LOCKED, else `userState`;
  - without it: in-app input events plus visibility, same threshold.
- **Heartbeats:** about every 60 s while the app is open, and immediately on a state change.
- **Idle prompt:** if a 028 timer is running and the user returns from IDLE or LOCKED after at least the threshold, show "You were idle N min — Keep / Remove". Remove → `POST /time/timer/trim {minutes: N}`.
