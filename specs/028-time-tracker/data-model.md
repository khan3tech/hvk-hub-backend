# Data Model: Time Tracker

All tables carry `orgId` and are queried with it.

## TimeProject
| Field | Type | Notes |
|---|---|---|
| id | cuid | |
| orgId | string | |
| name | string | 1–120 chars |
| code | string | 1–20 chars, uppercase; **unique per org** `@@unique([orgId, code])` |
| clientName | string? | ≤120 |
| billable | bool | default false; default for new entries (FR-005) |
| status | `ACTIVE` \| `ARCHIVED` | archived = no new time (FR-003) |
| ownerId | Employee.id | creator; HR/Admin can manage any project |
| createdAt / updatedAt | datetime | |

## TimeProjectMember
`projectId` + `employeeId` (composite id), `orgId`, `addedAt`. Only ACTIVE employees can be added.

## TimeTask
| Field | Type | Notes |
|---|---|---|
| id | cuid | |
| orgId, projectId | | |
| name | string | 1–120, unique within project |
| status | `ACTIVE` \| `ARCHIVED` | |
| createdAt | datetime | |

## TimeEntry
| Field | Type | Notes |
|---|---|---|
| id | cuid | |
| orgId, employeeId | | owner |
| projectId, taskId | | `projectId` denormalized from task (R3) |
| date | Date | org-local calendar date (R1) |
| weekStart | Date | Monday of `date` (R2) |
| minutes | int | 1–1440; daily total per employee ≤ 1440 (FR-006) |
| note | string? | ≤1000 |
| billable | bool | |
| source | `MANUAL` \| `TIMER` | |
| flagged | bool | timer overnight or >12h (R5) |
| createdAt / updatedAt | datetime | |

Indexes: `(orgId, employeeId, weekStart)`, `(orgId, date)`, `(orgId, projectId, date)`.

## RunningTimer
`id`, `orgId`, `employeeId` (**unique**), `taskId`, `projectId`, `startedAt` (datetime), `note?`.

## Timesheet
| Field | Type | Notes |
|---|---|---|
| id | cuid | |
| orgId, employeeId | | |
| weekStart | Date | **unique** `(employeeId, weekStart)` |
| status | `DRAFT` \| `SUBMITTED` \| `APPROVED` \| `REJECTED` | missing row = `NOT_STARTED` (API value only) |
| submittedAt | datetime? | |
| decidedAt | datetime? | |
| decidedById | Employee.id? | approver |
| reason | string? | rejection / reopen reason |
| updatedAt | datetime | |

### State transitions
```
NOT_STARTED/DRAFT/REJECTED --submit (employee, ≥1 entry, no running timer in week)--> SUBMITTED
SUBMITTED --approve (manager | HR/Admin, not self)--> APPROVED
SUBMITTED --reject + reason (manager | HR/Admin, not self)--> REJECTED   (week unlocked)
APPROVED  --reopen + reason (HR/Admin, not self)--> DRAFT
```
Locked (no entry changes, no timer start): SUBMITTED, APPROVED.
Every transition writes `ActivityLog { entity: "Timesheet", action: "timesheet.<verb>", before: {status}, after: {status, reason} }`.
