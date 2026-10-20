# Quickstart: Employee Management

Validates the feature end-to-end against a running `apps/api` + Postgres, using the seeded
accounts from 001 (`admin@teamloom.dev`, `hr@teamloom.dev`, `manager@teamloom.dev`,
`employee@teamloom.dev`, all password `Password123!`) plus new employees created during these
scenarios. See [contracts/employee-api.md](./contracts/employee-api.md) for exact request/response
shapes and [data-model.md](./data-model.md) for field definitions.

## Prerequisites

- Postgres running (`docker-compose up -d postgres`) and migrated.
- `apps/api` dev server running (`npm run --workspace apps/api dev`).
- 001's seed data present (four role accounts).
- At least one `Department` and one `Designation` exist (create via `POST /departments` /
  `POST /designations` as Admin if the seed doesn't already include them).

## Scenario 1 — HR onboards a new employee (User Story 1, P1)

1. Sign in as `hr@teamloom.dev`.
2. `POST /employees` with a valid `name`, `email`, `departmentId`, `designationId`,
   `dateOfJoining`, and no `managerId`.
3. **Expect**: 201, response includes a generated `employeeCode` (e.g. `EMP-00001`) and a
   `temporaryPassword`.
4. `GET /employees` as the same HR user.
5. **Expect**: the new employee appears in the list immediately (SC-001's "onboard in under 2
   minutes" — this step confirms no propagation delay, not the UI timing itself).
6. Sign in as the new employee using their email + the returned `temporaryPassword` (per 001's
   `POST /auth/login`).
7. **Expect**: sign-in succeeds — the linked `User` account works immediately (research.md R4).
8. Repeat step 2 omitting `name`.
9. **Expect**: 400 `VALIDATION_ERROR` with a field-specific error; no record created (spec
   Acceptance Scenario 3).

## Scenario 2 — Assigning and reflecting a reporting manager (User Story 1, Acceptance Scenario 2)

1. As HR, create a second employee (the "manager") if one doesn't already exist from seed data.
2. `PATCH /employees/:id` on the first employee (from Scenario 1), setting `managerId` to the
   manager's id.
3. **Expect**: 200, `managerId` updated.
4. Sign in as the manager. `GET /employees/me/team`.
5. **Expect**: the first employee now appears in `directReports`.

## Scenario 3 — Role-scoped directory (User Story 2, P1)

1. Sign in as `employee@teamloom.dev`. `GET /employees/directory?q=`.
2. **Expect**: 200, basic info (`name`, `departmentId`, `designationId`) for all active
   employees — no `email`, no salary-adjacent fields.
3. `GET /employees/:id` for an employee who is *not* the caller.
4. **Expect**: 403 `FORBIDDEN` (an Employee can't fetch another's full record).
5. `GET /employees/:id` for the caller's own id.
6. **Expect**: 200, full own record.
7. Sign in as `manager@teamloom.dev`. `GET /employees`.
8. **Expect**: 200, own record + direct reports only — not the whole org.
9. Sign in as `hr@teamloom.dev` or `admin@teamloom.dev`. `GET /employees?department=<id>`.
10. **Expect**: 200, all employees in that department across the org.

## Scenario 4 — Update propagates, offboarding preserves history (User Story 3, P2)

1. As HR, note an employee's current `managerId` (Manager A). `PATCH /employees/:id` to reassign
   to Manager B.
2. Sign in as Manager A. `GET /employees/me/team`.
3. **Expect**: the employee no longer appears in Manager A's `directReports`.
4. Sign in as Manager B. `GET /employees/me/team`.
5. **Expect**: the employee now appears in Manager B's `directReports` (SC-003 — same-session
   visibility, no stale views).
6. As HR, `POST /employees/:id/offboard` for that employee.
7. **Expect**: 200, `status: "OFFBOARDED"`.
8. `GET /employees` as HR with no filter.
9. **Expect**: the offboarded employee does not appear in the default active list (verify the
   endpoint's default filtering excludes `OFFBOARDED`, or that `status=ACTIVE` is required to
   see them — confirm against the implemented default at `/speckit-tasks` time).
10. Attempt sign-in as the offboarded employee (`POST /auth/login`).
11. **Expect**: 401 `INVALID_CREDENTIALS` (001's FR-010 — offboarded users can't sign in).
12. As HR, fetch the offboarded employee's historical records (e.g. any seeded attendance/payslip
    rows from other features, if present) — or, if 003/004 aren't implemented yet, confirm via
    direct DB inspection that no attendance/payslip/leave rows referencing this employee were
    deleted or altered (SC-004 — zero data loss).

## Scenario 5 — Manager self-reference and cycle rejection (Edge Cases, research.md R2)

1. As HR, `PATCH /employees/:id` setting `managerId` to the same `:id` (self-reference).
2. **Expect**: 409 `MANAGER_INVALID`.
3. Create three employees A, B, C. Set A's manager to B, B's manager to C.
4. Attempt to set C's manager to A (would close a cycle A→B→C→A).
5. **Expect**: 409 `MANAGER_INVALID`.
6. Offboard employee B. Attempt to set a new employee's `managerId` to B.
7. **Expect**: 409 `MANAGER_INVALID` (spec Edge Cases — can't assign an offboarded manager).

## Success criteria checklist (from spec.md)

- [ ] SC-001: HR onboards a new employee end-to-end in under 2 minutes (Scenario 1, manual UI
      timing once the frontend form exists)
- [ ] SC-002: 100% correct directory scoping across all four roles (Scenario 3)
- [ ] SC-003: org-chart changes visible to all affected users within the same session
      (Scenario 4, steps 2-5)
- [ ] SC-004: zero permanent data loss on offboarding (Scenario 4, steps 6-12)
