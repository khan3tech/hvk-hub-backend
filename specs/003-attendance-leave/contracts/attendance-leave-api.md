# Contract: Attendance & Leave API (`/attendance`, `/leave-requests`, `/leave-types`, `/leave-balances`, `/holidays`)

Per constitution Technology Stack, the canonical machine-readable contract is the OpenAPI
document generated at runtime from each endpoint's `zod` schema, registered in
`apps/api/src/lib/openapi.ts` via `registry.registerPath(...)` from
`modules/attendance/routes.ts`, matching 001/002's pattern.

All request/response schemas extend `modules/attendance/schema.ts` (`AttendanceRecordSchema`,
`CreateLeaveRequestSchema`, `LeaveRequestSchema`, `RejectLeaveRequestSchema`, `LeaveTypeSchema`,
`LeaveBalanceSchema`, `HolidaySchema` already exist; new schemas needed are marked **NEW**).

Every error response uses the constitution's standard shape:
`{ error: { code, message, fields? } }`. Every endpoint requires `authenticate` (001); role
requirements are per-endpoint.

---

## POST /attendance/check-in

**Role required**: any authenticated user (FR-001).

**Request**: no body.

**Response 201** (`AttendanceRecordSchema`): today's record with `checkIn` set.

**Errors**: 409 `ALREADY_CHECKED_IN` — already checked in today (FR-003).

---

## POST /attendance/check-out

**Role required**: any authenticated user (FR-001).

**Request**: no body.

**Response 200** (`AttendanceRecordSchema`): today's record with `checkOut` set.

**Errors**:
| Status | code | When |
|---|---|---|
| 409 | `NOT_CHECKED_IN` | No check-in recorded yet today |
| 409 | `ALREADY_CHECKED_OUT` | Already checked out today (FR-003) |

---

## GET /attendance/me

**Role required**: any authenticated user (spec User Story 1 Acceptance Scenario 4).

**Query params**: `from`, `to` (optional date range; defaults to the current month).

**Response 200** (**NEW** `AttendanceHistoryResponseSchema` — `z.array(AttendanceRecordSchema)`):
the caller's own attendance history. A day with no row is synthesized as `{ status: "ABSENT",
checkIn: null, checkOut: null }` in the response (research.md R6) rather than omitted, so the UI
can render a complete calendar without special-casing gaps.

---

## POST /leave-requests

**Role required**: any authenticated user (FR-006).

**Request** (`CreateLeaveRequestSchema`, exists):
```json
{
  "leaveTypeId": "string", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD",
  "employeeId": "string (optional, HR/Admin only — records after-the-fact leave for someone else, spec Edge Cases)"
}
```

**Response 201** (**NEW** `CreateLeaveRequestResponseSchema` — `LeaveRequestSchema` extended
with an `overlaps` field):
```json
{
  "id": "...", "employeeId": "...", "leaveTypeId": "...", "startDate": "...", "endDate": "...",
  "days": 3, "status": "PENDING", "approverId": null,
  "overlaps": { "holidays": [{"id":"...","name":"...","date":"..."}], "approvedLeave": [] }
}
```

**Errors**:
| Status | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `startDate > endDate`, or a non-HR/Admin caller requesting a past `startDate` (spec Edge Cases) |
| 403 | `FORBIDDEN` | A non-HR/Admin caller sets `employeeId` to someone other than themself |
| 409 | `INSUFFICIENT_BALANCE` | Working-day count (research.md R1) exceeds remaining balance for that leave type/year (FR-007) |

**Side effects**: computes `days` via `countWorkingDays` (research.md R1); does NOT touch
`LeaveBalance` (FR-010 — only approval decrements); computes `overlaps` (research.md R2) as an
informational, non-blocking field in the response.

---

## GET /leave-requests/me

**Role required**: any authenticated user (spec User Story 2 Acceptance Scenario 3).

**Response 200** (**NEW** `LeaveRequestListResponseSchema` — `z.array(LeaveRequestSchema)`): the
caller's own leave requests, all statuses, newest first.

---

## GET /leave-requests/queue

**Role required**: `MANAGER`, `HR`, `ADMIN` (FR-014/FR-015).

**Response 200** (`LeaveRequestListResponseSchema`): pending requests only. `MANAGER` sees only
their current direct reports' requests (research.md R5 — computed live, never a Manager's own
requests per research.md R3); `HR`/`ADMIN` see every pending request company-wide.

---

## POST /leave-requests/:id/approve

**Role required**: `MANAGER`, `HR`, `ADMIN` (FR-009).

**Request**: no body.

**Response 200** (`LeaveRequestSchema`): the now-`APPROVED` request.

**Errors**:
| Status | code | When |
|---|---|---|
| 403 | `SELF_APPROVAL_FORBIDDEN` | Caller is the request's own employee (research.md R3/R4, unconditional — even HR/Admin) |
| 403 | `FORBIDDEN` | Caller is a Manager who is not this employee's current manager (and not HR/Admin) |
| 404 | `NOT_FOUND` | `id` doesn't exist in caller's org |
| 409 | `ALREADY_DECIDED` | Request is not `PENDING` (FR-012) |

**Side effects** (one transaction, constitution Principle IV): sets `status = APPROVED`,
`approverId = caller.employeeId`, `decidedAt = now`; increments the relevant `LeaveBalance.used`
by `days` (re-computed via `countWorkingDays`, research.md R1); writes an `Attendance` row
(`status: ON_LEAVE`) for each working day in the range (research.md R7); writes `ActivityLog`
(`action: "leave.approved"`).

---

## POST /leave-requests/:id/reject

**Role required**: `MANAGER`, `HR`, `ADMIN` (FR-009).

**Request** (`RejectLeaveRequestSchema`, exists): `{ "reason": "string, min 1 char" }`.

**Response 200** (`LeaveRequestSchema`): the now-`REJECTED` request, `rejectionReason` set.

**Errors**: same `SELF_APPROVAL_FORBIDDEN`/`FORBIDDEN`/`NOT_FOUND`/`ALREADY_DECIDED` as approve;
plus 400 `VALIDATION_ERROR` if `reason` is missing/empty (FR-011).

**Side effects**: sets `status = REJECTED`, `approverId`, `decidedAt`, `rejectionReason`; does
NOT touch `LeaveBalance` (FR-010 — rejection never decrements); writes `ActivityLog`
(`action: "leave.rejected"`).

---

## GET /leave-balances/me

**Role required**: any authenticated user (FR-005, spec User Story 2).

**Query params**: `year` (optional, defaults to current year).

**Response 200** (**NEW** `LeaveBalanceListResponseSchema` — `z.array(LeaveBalanceSchema)`): one
row per leave type for the caller, lazily created with `used: 0` from `LeaveType.defaultDays` if
no row exists yet for that employee/type/year (data-model.md § LeaveBalance).

---

## GET /leave-types

**Role required**: any authenticated user.

**Response 200**: `z.array(LeaveTypeSchema)`.

## POST /leave-types

**Role required**: `ADMIN`, `HR` (FR-004).

**Request**: `{ "name": "string", "isPaid": "boolean", "defaultDays": "number >= 0" }`.

**Response 201**: `LeaveTypeSchema`.

**Errors**: 409 `LEAVE_TYPE_EXISTS` if `name` already used in this org.

## GET /holidays

**Role required**: any authenticated user (FR-013 "viewable by all employees").

**Query params**: `year` (optional).

**Response 200**: `z.array(HolidaySchema)`.

## POST /holidays

**Role required**: `ADMIN`, `HR` (FR-013).

**Request**: `{ "name": "string", "date": "YYYY-MM-DD", "region": "string (optional)" }`.

**Response 201**: `HolidaySchema`.

---

## Schema additions needed in `modules/attendance/schema.ts`

New (not yet present):
- `AttendanceHistoryResponseSchema` — `z.array(AttendanceRecordSchema)`.
- `CreateLeaveRequestResponseSchema` — `LeaveRequestSchema.extend({ overlaps: z.object({
  holidays: z.array(HolidaySchema), approvedLeave: z.array(LeaveRequestSchema) }) })`.
- `LeaveRequestListResponseSchema` — `z.array(LeaveRequestSchema)`.
- `LeaveBalanceListResponseSchema` — `z.array(LeaveBalanceSchema)`.
- `CreateLeaveTypeRequestSchema` — `{ name: z.string().min(1), isPaid: z.boolean(), defaultDays:
  z.number().nonnegative() }`.
- `CreateHolidayRequestSchema` — `{ name: z.string().min(1), date: z.string().date(), region:
  z.string().optional() }`.

Existing, unchanged: `AttendanceStatusSchema`, `AttendanceRecordSchema`,
`LeaveRequestStatusSchema`, `CreateLeaveRequestSchema`, `LeaveRequestSchema`,
`RejectLeaveRequestSchema`, `LeaveTypeSchema`, `LeaveBalanceSchema`, `HolidaySchema`.

## Middleware reuse (from 001, no change)

- `authenticate` — verifies the access token / refresh-cookie fallback, attaches `req.user`.
- `authorize(...roles: Role[])` — role-only gate; "my direct reports" scoping for the approval
  queue stays in `modules/attendance/service.ts`, calling 002's exported employee service
  functions rather than querying `Employee` directly (constitution Principle I/III).
