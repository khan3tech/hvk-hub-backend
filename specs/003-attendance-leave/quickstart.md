# Quickstart: Attendance & Leave

Validates the feature end-to-end against a running `apps/api` + Postgres, using the seeded
accounts from 001/002 (`admin@teamloom.dev`, `hr@teamloom.dev`, `manager@teamloom.dev`,
`employee@teamloom.dev`, all password `Password123!`; `employee` reports to `manager`). See
[contracts/attendance-leave-api.md](./contracts/attendance-leave-api.md) for exact request/
response shapes and [data-model.md](./data-model.md) for field definitions.

## Prerequisites

- Postgres running (`docker-compose up -d postgres`) and migrated.
- `apps/api` dev server running (`npm run --workspace apps/api dev`).
- 001/002 seed data present (four role accounts, employee reports to manager).
- At least one `LeaveType` exists (create via `POST /leave-types` as HR/Admin if the seed
  doesn't already include one, e.g. `{ "name": "Paid", "isPaid": true, "defaultDays": 20 }`).

## Scenario 1 — Check in and out for the day (User Story 1, P1)

1. Sign in as `employee@teamloom.dev`. `POST /attendance/check-in`.
2. **Expect**: 201, `checkIn` set, `checkOut` null.
3. Repeat `POST /attendance/check-in`.
4. **Expect**: 409 `ALREADY_CHECKED_IN` (FR-003, spec Acceptance Scenario 3).
5. `POST /attendance/check-out`.
6. **Expect**: 200, both `checkIn` and `checkOut` set.
7. `GET /attendance/me`.
8. **Expect**: today's record shows both times; hours-worked is derivable from `checkOut -
   checkIn` (SC-001's "single action" timing is a UI/interaction measurement, not directly
   testable via curl).

## Scenario 2 — File a leave request within balance (User Story 2, P1)

1. Sign in as HR. `POST /leave-types` if none exist yet.
2. Sign in as `employee@teamloom.dev`. `GET /leave-balances/me`.
3. **Expect**: 200, a row per leave type (lazily created if this is the employee's first check
   this year), `allocated` from `LeaveType.defaultDays`, `used: 0`.
4. `POST /leave-requests` for a date range of working days well within the balance.
5. **Expect**: 201, `status: "PENDING"`, `days` equal to the *working-day* count only (weekends
   excluded — spec Clarifications). Re-check `GET /leave-balances/me`.
6. **Expect**: `used` unchanged — submission does not decrement (FR-010, SC-003).
7. `POST /leave-requests` for a range that exceeds the remaining balance.
8. **Expect**: 409 `INSUFFICIENT_BALANCE`, no request created.
9. `POST /leave-requests` for a range spanning a weekend and/or a configured `Holiday`.
10. **Expect**: `days` counts only the Mon–Fri, non-holiday days in the range (spec
    Clarifications, FR-008).

## Scenario 3 — Manager approves and rejects (User Story 3, P1)

1. Using the pending request from Scenario 2, sign in as `manager@teamloom.dev`.
   `GET /leave-requests/queue`.
2. **Expect**: 200, includes the employee's pending request (Manager sees their direct reports'
   requests).
3. `POST /leave-requests/:id/approve`.
4. **Expect**: 200, `status: "APPROVED"`. Re-check `GET /leave-balances/me` as the employee.
5. **Expect**: `used` incremented by exactly the request's working-day count.
6. `GET /attendance/me` as the employee, for the approved date range.
7. **Expect**: those working days show `status: "ON_LEAVE"` (research.md R7).
8. File a second leave request as the employee, then reject it as the manager with
   `POST /leave-requests/:id/reject` and a `reason`.
9. **Expect**: 200, `status: "REJECTED"`, `rejectionReason` set; `GET /leave-balances/me` shows
   `used` unchanged from step 5 (rejection never decrements, FR-010/SC-003).
10. Attempt to approve the already-rejected request from step 9.
11. **Expect**: 409 `ALREADY_DECIDED` (FR-012, SC-005).

## Scenario 4 — Self-approval is impossible (Edge Cases, research.md R3/R4)

1. Sign in as `manager@teamloom.dev`. File a leave request for themself
   (`POST /leave-requests`).
2. `GET /leave-requests/queue` as the same manager.
3. **Expect**: the manager's own request does NOT appear in their own queue (research.md R3).
4. Attempt `POST /leave-requests/:id/approve` on their own request, as themself.
5. **Expect**: 403 `SELF_APPROVAL_FORBIDDEN` — refused even though they're a valid approver role
   in general (research.md R4, unconditional rule).
6. Sign in as HR/Admin. `GET /leave-requests/queue`.
7. **Expect**: the manager's own pending request appears here instead (routed to HR/Admin per
   spec Edge Cases, since this manager's own `managerId` is unset in seed data).

## Scenario 5 — Scoped approval queue (User Story 3 Acceptance Scenario 3, SC-004)

1. Sign in as `manager@teamloom.dev`. `GET /leave-requests/queue`.
2. **Expect**: only requests from `manager`'s own direct reports (e.g. `employee@teamloom.dev`),
   never a request from an employee outside their reporting line.
3. Sign in as HR or Admin. `GET /leave-requests/queue`.
4. **Expect**: every pending request company-wide, regardless of reporting line (FR-015).

## Success criteria checklist (from spec.md)

- [ ] SC-001: check-in/check-out completes in under 5s including page load (UI timing —
      confirm once the frontend exists)
- [ ] SC-002: filing a leave request completes in under 1 minute (UI timing)
- [ ] SC-003: zero observed cases of a balance changing on submission or rejection (Scenarios
      2 and 3)
- [ ] SC-004: Manager's queue never shows a request outside their reporting line (Scenario 5)
- [ ] SC-005: a decided request's status never changes again (Scenario 3, steps 10-11)
