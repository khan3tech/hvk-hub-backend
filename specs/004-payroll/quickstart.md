# Quickstart: Payroll

Validates the feature end-to-end against a running `apps/api` + Postgres, using the seeded
accounts from 001/002/003 (`admin@hvk.in`, `hr@hvk.in`, `manager@hvk.in`,
`employee@hvk.in`, all password `Password123!`; `employee` reports to `manager`). See
[contracts/payroll-api.md](./contracts/payroll-api.md) for exact request/response shapes and
[data-model.md](./data-model.md) for field definitions.

## Prerequisites

- Postgres running (`docker-compose up -d postgres`) and migrated.
- `apps/api` dev server running (`npm run --workspace apps/api dev`).
- 001/002/003 seed data present (four role accounts, employee reports to manager).
- 002's `getOffboardedDate` and 003's `getUnpaidLeaveDaysForPeriod` implemented (this feature's
  Foundational phase, per tasks.md).

## Scenario 1 — HR defines a salary structure (User Story 1, P1)

1. Sign in as HR. `POST /payroll/salary-structures/:employeeId` for `employee@hvk.in` with
   `{ basic: 50000, hra: 10000, allowances: { transport: 2000 }, effectiveFrom: "2026-01-01" }`.
2. **Expect**: 201, the new structure returned.
3. `GET /payroll/salary-structures/:employeeId`.
4. **Expect**: 200, matches what was set.
5. Set a second version with a later `effectiveFrom` (e.g. `2026-10-01`, a raise).
6. `GET /payroll/salary-structures/:employeeId?asOf=2026-09-15`.
7. **Expect**: returns the *first* version (Jan) — the second (Oct) hasn't taken effect yet for
   that date (FR-002, research.md R1).
8. Sign in as `employee@hvk.in`. Attempt `POST /payroll/salary-structures/:employeeId` for
   themself.
9. **Expect**: 403 — editing is refused for everyone except HR/Admin (spec Acceptance
   Scenario 3).
10. `GET /payroll/salary-structures/:employeeId` for their own id.
11. **Expect**: 200 — Employees may view their own.
12. `GET /payroll/salary-structures/:employeeId` for someone else's id (e.g. the manager's).
13. **Expect**: 403.

## Scenario 2 — HR runs payroll for a period (User Story 2, P1)

1. Ensure `employee@hvk.in` has a salary structure effective before the target period
   (from Scenario 1) and `manager@hvk.in` does NOT yet have one.
2. Sign in as HR. `POST /payroll/runs` for `{ periodMonth: 9, periodYear: 2026 }`.
3. **Expect**: 200, `payslipCount >= 1`, `skipped` includes `manager@hvk.in`'s id with
   `reason: "NO_SALARY_STRUCTURE"` (FR-011) — not silently omitted.
4. `GET /payroll/payslips` (HR, org-wide) filtered to that period.
5. **Expect**: one payslip for `employee@hvk.in`, none for `manager@hvk.in`.
6. Set a salary structure for `manager@hvk.in` (effective before the period). Re-run
   `POST /payroll/runs` for the same period.
7. **Expect**: 200, `payslipCount` now includes both employees; `skipped` is empty.
8. `GET /payroll/payslips` again for that period.
9. **Expect**: still exactly one payslip per employee for that period (FR-006, SC-005) — the
   first run's payslip for `employee@hvk.in` was replaced (same row, new `generatedAt`),
   not duplicated.

## Scenario 3 — Unpaid-leave deduction and proration (User Story 2, edge cases)

1. As HR, create an unpaid `LeaveType` if one doesn't exist (`POST /leave-types` from 003:
   `{ name: "Unpaid", isPaid: false, defaultDays: 30 }`).
2. As the employee, file and get approved (via manager) a leave request under that type, for
   several working days within the target payroll period (003's flow).
3. Run payroll for that period (`POST /payroll/runs`).
4. `GET /payroll/payslips/me/:id` as the employee (or `/payroll/payslips` as HR) for that period.
5. **Expect**: `deductions.unpaidLeave` reflects those working days at the daily rate implied by
   the salary structure — net pay reduced accordingly (FR-004, SC-002).
6. As HR, offboard an employee partway through a period (002's `POST /employees/:id/offboard`)
   with an effective offboard date inside the target period.
7. Run payroll for that period.
8. **Expect**: that employee's payslip is prorated to their last active day, not a full period's
   pay (FR-012, research.md R3/R4).

## Scenario 4 — Employee self-service payslip access (User Story 3, P2)

1. Sign in as `employee@hvk.in`. `GET /payroll/payslips/me`.
2. **Expect**: 200, a list including the period(s) run above.
3. `GET /payroll/payslips/me/:id` for one of their own payslips.
4. **Expect**: 200, full earnings/deductions/net-pay breakdown, obtainable as a downloadable copy
   (SC-003 — locate and open in under 30s, a UI-timing check once the frontend exists).
5. Attempt `GET /payroll/payslips/me/:id` using another employee's payslip id.
6. **Expect**: 403 (spec Acceptance Scenario 3).
7. Sign in as `manager@hvk.in`. `GET /payroll/payslips/team`.
8. **Expect**: 200, payslips for direct reports only, in view-only form (no edit endpoint exists
   for this role at all — enforced structurally, not just by omission from the UI).

## Success criteria checklist (from spec.md)

- [ ] SC-001: a full payroll run for the active workforce completes in a single action, results
      available within minutes (Scenario 2)
- [ ] SC-002: 100% correct unpaid-leave proration during acceptance testing, zero discrepancies
      vs. manual calculation (Scenario 3)
- [ ] SC-003: an Employee locates and opens a past payslip in under 30 seconds (UI timing,
      Scenario 4)
- [ ] SC-004: zero cases of a payslip being directly edited outside a full re-run (structural —
      no edit endpoint exists in contracts/payroll-api.md at all)
- [ ] SC-005: re-running payroll never produces more than one payslip per employee per period
      (Scenario 2, steps 6-9)
