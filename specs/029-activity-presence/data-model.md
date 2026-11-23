# Data Model: Activity & Presence

## ActivitySpan
| Field | Type | Notes |
|---|---|---|
| id | cuid | |
| orgId, employeeId | string | employee id as plain column (no relation to 002) |
| state | `ACTIVE` \| `IDLE` \| `LOCKED` | |
| startedAt | datetime | server time |
| endedAt | datetime | server time; extended by heartbeats |

Indexes: `(orgId, employeeId, startedAt)`, `(endedAt)` (purge).

## ActivityPresence
`employeeId` (**unique**), `orgId`, `state` (`ACTIVE`|`IDLE`|`LOCKED`), `lastSeenAt`, `spanId` (latest span).
Derived status: `ACTIVE` | `AWAY` | `OFFLINE` (R4).

## ActivitySettings
`orgId` (**unique**), `enabled` (default true), `idleThresholdMinutes` (1–60, default 5), `updatedAt`.
