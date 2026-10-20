# Phase 1 Data Model: Attendance & Leave

All models this feature needs already exist in `apps/api/prisma/schema.prisma` (added up front
per constitution Principle VI). This feature adds no new models and no migration — it documents
how the existing `Attendance`, `LeaveType`, `LeaveBalance`, `LeaveRequest`, and `Holiday` models
are read/written by this feature's service layer.

## Attendance (existing model, used not modified)

| Field | Type | Used by this feature as |
|---|---|---|
| `id` | `String @id` | Primary key. |
| `orgId` | `String` | Every query scopes by this (Principle VI). |
| `employeeId` | `String` | FK to `Employee` (002's model, not owned here). |
| `date` | `DateTime @db.Date` | The calendar day this record is for; `@@unique([employeeId, date])` prevents more than one row per employee per day. |
| `checkIn` | `DateTime?` | Set by `POST /attendance/check-in` (FR-001). |
| `checkOut` | `DateTime?` | Set by `POST /attendance/check-out` (FR-001); hours worked (FR-002) is `checkOut - checkIn`, computed on read, not stored. |
| `status` | `AttendanceStatus` (`PRESENT \| ABSENT \| ON_LEAVE \| HOLIDAY`) | `PRESENT` once both times are set; `ON_LEAVE`/`HOLIDAY` written by the leave-approval flow (research.md R7) and a holiday-sync process respectively; a day with no row at all reads as `ABSENT` in the history view (research.md R6) — no row is pre-created for "absent" days. |

**Validation rules** (enforced in `modules/attendance/service.ts`):
- `POST /attendance/check-in`: reject with `DomainError("ALREADY_CHECKED_IN", ..., 409)` if a row
  for `[employeeId, today]` already has `checkIn` set (FR-003, spec Acceptance Scenario 3).
- `POST /attendance/check-out`: reject with `DomainError("NOT_CHECKED_IN", ..., 409)` if no row
  exists for `[employeeId, today]` or `checkIn` is null; reject with
  `DomainError("ALREADY_CHECKED_OUT", ..., 409)` if `checkOut` is already set (FR-003).
- A row with `checkIn` set and `checkOut` still null is read by the UI as "incomplete" for a past
  date (spec Edge Cases — missed checkout), not silently treated as a full day.

**State transitions** (`checkIn`/`checkOut`/`status`):
```
(no row) --check-in--> checkIn=now, status stays PRESENT-default but incomplete until checkout
  --check-out--> checkIn set, checkOut=now, status=PRESENT
(no row, past date, never checked in) --read as--> ABSENT (no row written)
(no row) --leave approved for this date--> status=ON_LEAVE (research.md R7)
(no row) --holiday sync for this date--> status=HOLIDAY
```

## LeaveType (existing model, used not modified)

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | Primary key. |
| `orgId` | `String` | Scope. |
| `name` | `String` | `@@unique([orgId, name])`; FR-004 configurable list. |
| `isPaid` | `Boolean @default(true)` | Informational; not enforced by any acceptance scenario in this feature (no payroll integration yet — 004's concern). |
| `defaultDays` | `Int` | The annual allocation used to seed a new `LeaveBalance` row when one doesn't yet exist for an employee/year (FR-004/FR-005). |

**Validation rules**: `name` required, unique per org; `defaultDays >= 0` (HR/Admin only,
FR-004).

## LeaveBalance (existing model, used not modified)

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | Primary key. |
| `orgId` | `String` | Scope. |
| `employeeId` | `String` | FK to `Employee`. |
| `leaveTypeId` | `String` | FK to `LeaveType`. |
| `year` | `Int` | Calendar year this balance applies to (FR-005 — per employee, per leave type, per year). |
| `allocated` | `Float` | Set from `LeaveType.defaultDays` when the row is first created (lazily, on first request or first balance view — no bulk year-rollover job needed for v0.1, per spec Assumptions' "no carry-over"). |
| `used` | `Float @default(0)` | Incremented only on request approval (FR-010), by the working-day count (research.md R1). `@@unique([employeeId, leaveTypeId, year])`. |

**Validation rules**:
- A request is blocked (FR-007) if `countWorkingDays(range) > (allocated - used)` for that
  `[employeeId, leaveTypeId, year]` row (lazily created with `used=0` if it doesn't exist yet).
- `used` is only ever incremented (on approval) — never decremented in this feature (no
  "cancel an approved leave" flow exists in spec's scope; that would be a future feature).

## LeaveRequest (existing model, used not modified)

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | Primary key. |
| `orgId` | `String` | Scope. |
| `employeeId` | `String` | The requester (`"LeaveRequester"` relation on `Employee`). |
| `leaveTypeId` | `String` | FK to `LeaveType`. |
| `startDate` / `endDate` | `DateTime @db.Date` | The requested range (FR-006), inclusive. |
| `days` | `Float` | The *working-day* count (research.md R1) charged against the balance — computed at creation and re-verified (not re-stored) at approval time to guard against a holiday calendar change in between (research.md R1). |
| `status` | `LeaveRequestStatus` (`PENDING \| APPROVED \| REJECTED`) | One-directional: `PENDING → APPROVED` or `PENDING → REJECTED`, never further (FR-012, constitution Principle IV). |
| `approverId` | `String?` | Set only at decision time (`"LeaveApprover"` relation on `Employee`) — null while `PENDING`, which is what makes research.md R5's "live queue" approach correct (no stale assignment to clean up). |
| `rejectionReason` | `String?` | Required (FR-011) when `status` transitions to `REJECTED`; null otherwise. |
| `createdAt` | `DateTime @default(now())` | Submission time. |
| `decidedAt` | `DateTime?` | Set at decision time. |

**Validation rules**:
- Create (FR-006): `startDate <= endDate`; for a self-service `EMPLOYEE`/`MANAGER` request,
  `startDate >= today` (spec Edge Cases — past-date requests are HR/Admin-only, see below).
  HR/Admin creating a request on someone else's behalf may set `startDate` in the past
  (after-the-fact recording, spec Edge Cases).
- Approve/reject: only permitted while `status = PENDING`; any further attempt throws
  `DomainError("ALREADY_DECIDED", ..., 409)` (FR-012, SC-005).
- Approve/reject: `request.employeeId !== caller.employeeId` MUST hold, or throw
  `DomainError("SELF_APPROVAL_FORBIDDEN", ..., 403)` (research.md R3/R4, spec Edge Cases).
- Reject: `RejectLeaveRequestSchema.reason` is required, non-empty (FR-011).

**State transitions**:
```
PENDING (approverId=null)
  --approve (by Manager/HR/Admin, not self)--> APPROVED (approverId=caller, decidedAt=now,
    LeaveBalance.used += days, Attendance rows written ON_LEAVE for each working day, research.md R7)
  --reject (by Manager/HR/Admin, not self, reason required)--> REJECTED (approverId=caller,
    decidedAt=now, rejectionReason set, LeaveBalance untouched)
APPROVED / REJECTED
  --any further decision attempt--> refused, no state change (FR-012)
```

## Holiday (existing model, used not modified)

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | Primary key. |
| `orgId` | `String` | Scope. |
| `name` | `String` | E.g. "New Year's Day" (FR-013). |
| `date` | `DateTime @db.Date` | The observed date. |
| `region` | `String?` | Optional regional scoping (spec Key Entities: "optionally regional") — not filtered on in this feature's queries (single-org, no regional employee assignment exists yet); read but not acted on differently per region in v0.1. |

**Validation rules**: HR/Admin only for create (FR-013); any authenticated user can list
(FR-013 "viewable by all employees").

## ActivityLog (existing model, new usage)

No schema change. This feature writes these `action` values, per constitution Principle IV's
explicit callout that leave approvals are an irreversible business event requiring an
append-only audit row in the same transaction as the state change:
- `action: "leave.approved"` — `entity: "LeaveRequest"`, `after: { status: "APPROVED",
  daysCharged: <days> }` (FR-010, FR-011... actually FR-009's decision-audit intent).
- `action: "leave.rejected"` — `entity: "LeaveRequest"`, `after: { status: "REJECTED", reason }`.

`actorId` is the calling Manager/HR/Admin's `employeeId` — same pattern as 001/002; an
HR/Admin `User` with no linked `Employee` inherits the same known gap already flagged in 001's
data-model.md (skip the write rather than crash — not re-solved here).
