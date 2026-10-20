---

description: "Task list for Payroll"
---

# Tasks: Payroll

**Input**: Design documents from `/specs/004-payroll/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/payroll-api.md,
quickstart.md

**Tests**: Not explicitly requested in the feature specification — no dedicated test-writing
tasks are included. `quickstart.md`'s scenarios serve as the manual/automated acceptance
validation at the end of each story, following the same precedent as 001-auth-rbac,
002-employee-management, and 003-attendance-leave.

**Organization**: Tasks are grouped by user story (spec.md: US1, US2, US3 — priorities P1, P1,
P2) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- File paths are exact, relative to repo root

## Path Conventions

Web app layout already scaffolded in this repo: `apps/api/src/...` (backend), `apps/web/...`
(frontend). See plan.md § Project Structure for the full existing-file map. `SalaryStructure`
and `Payslip` Prisma models already exist in `apps/api/prisma/schema.prisma` — no migration task
is needed (plan.md Storage, data-model.md). This feature calls 001's `authenticate`/`authorize`
middleware and 002's exported employee service functions as-is, and adds two small new exported
functions to 002 and 003's own service.ts files (research.md R2, R4) — those are the only
changes anticipated to modules this feature doesn't own.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the ground this feature builds on is in place before any payroll code is
written. Everything needed already exists from 001/002/003 — verify, don't recreate.

- [X] T001 Verify `apps/api/src/middleware/authenticate.ts` and `authorize.ts` (001) are
  importable as-is by `apps/api/src/modules/payroll/routes.ts` — no changes needed. Confirmed
  during 001/002/003's own implementation passes; both export plain, module-agnostic functions.
- [X] T002 [P] Verify `apps/api/src/modules/employee/service.ts`'s exported `getEmployee` and
  `getTeamView` (002) are importable as-is by `apps/api/src/modules/payroll/service.ts` for
  reporting-line/manager checks — no changes needed, and no direct `Employee` Prisma queries
  from this module (constitution Principle I). Confirmed stable signatures during 003's own
  implementation pass, unchanged since.
- [X] T003 [P] Verify at least one `LeaveType` with `isPaid: false` exists per org (needed to
  exercise the unpaid-leave deduction in quickstart.md Scenario 3); add one via
  `apps/api/prisma/seed.ts` if missing (e.g. `{ name: "Unpaid", isPaid: false, defaultDays: 30 }`).
  None existed — added an upsert for `{ orgId, name: "Unpaid", isPaid: false, defaultDays: 30 }`
  to `seed.ts`, alongside the existing "Paid" type.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The two small cross-module reads this feature depends on (research.md R2, R4),
plus repository primitives every user story needs.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Add `getOffboardedDate(orgId: string, employeeId: string): Promise<Date | null>` to
  `apps/api/src/modules/employee/service.ts` (research.md R4): query for the `ActivityLog` row
  with `entity: "Employee"`, `entityId: employeeId`, `action: "employee.offboarded"`
  (data-model.md's existing 002 usage — confirm the exact query shape against
  `writeActivityLog`'s call site in `offboardEmployee`); return its `createdAt`, or `null` if no
  such row exists. Read-only addition — no schema change, no other change to `offboardEmployee`
  itself. Added `repo.findOffboardActivityLog` (queries the existing `@@index([orgId, entity,
  entityId])`) to back it.
- [X] T005 Add `getUnpaidLeaveDaysForPeriod(orgId: string, employeeId: string, periodStart: Date,
  periodEnd: Date): Promise<number>` to `apps/api/src/modules/attendance/service.ts`
  (research.md R2): find `LeaveRequest` rows for that employee with `status: "APPROVED"` whose
  `leaveType.isPaid === false` and whose `[startDate, endDate]` overlaps `[periodStart,
  periodEnd]`; for each, compute the working-day count *clipped to the period's own bounds*
  using the module's existing `countWorkingDays`-equivalent logic (weekday-only, holiday-
  excluded, per 003 research.md R1); sum and return. Read-only addition — no schema change.
  Added `repo.findApprovedUnpaidLeaveInRange` (joins `leaveType: { isPaid: false }`) to back it;
  each matching request's range is clipped to `[periodStart, periodEnd]` before counting so a
  leave spanning outside the period isn't over-charged.
- [X] T006 Implement `apps/api/src/modules/payroll/repository.ts`:
  `findEffectiveSalaryStructure(orgId, employeeId, periodEndDate)` (data-model.md's lookup
  query — latest `effectiveFrom <= periodEndDate`), `createSalaryStructure(data)`,
  `findActiveEmployeesForPeriod(orgId, periodStart, periodEnd)` (active now, or offboarded with
  an offboard date inside the period — used by T014), `upsertPayslip(where, data)` (keyed on the
  schema's existing `@@unique([employeeId, periodMonth, periodYear])`),
  `findPayslipsForEmployee(orgId, employeeId, filters)`, `findPayslipById(orgId, id)`,
  `findPayslipsForEmployees(orgId, employeeIds, filters)`, `findPayslipsOrgWide(orgId,
  filters)`, `writeActivityLog(params)` — Prisma queries only, per constitution Principle I (no
  other module imports this file). `findActiveEmployeesForPeriod` takes only `periodStart` (not
  `periodEnd`) — it's a cheap DB-level pre-filter (`status: ACTIVE` OR `status: OFFBOARDED` with
  `updatedAt >= periodStart`), not the exact eligibility decision; T014's service layer makes
  the precise call per employee via 002's `getOffboardedDate`.
- [X] T007 [P] Extend `apps/api/src/modules/payroll/schema.ts` per contracts/payroll-api.md §
  Schema additions: add `RunPayrollResponseSchema` (`{ periodMonth: z.number(), periodYear:
  z.number(), payslipCount: z.number(), skipped: z.array(z.object({ employeeId: z.string(),
  reason: z.string() })) }`); add `PayslipListResponseSchema` (`z.array(PayslipSchema)`).

**Checkpoint**: Cross-module reads and repository primitives all exist. User story
implementation can now begin.

---

## Phase 3: User Story 1 - HR defines an employee's salary structure (Priority: P1) 🎯 MVP

**Goal**: HR/Admin can create a versioned salary structure for an employee; Employees can view
their own; no one but HR/Admin can edit.

**Independent Test**: Create a salary structure for one employee and confirm it's retrievable
and editable-only-by-HR (quickstart.md Scenario 1).

### Implementation for User Story 1

- [X] T008 [US1] Implement `setSalaryStructure(orgId, employeeId, input, actor)` in
  `apps/api/src/modules/payroll/service.ts`: validate `basic >= 0`, `hra >= 0`, every value in
  `allowances` `>= 0` (FR-001, data-model.md); insert a new `SalaryStructure` row via
  `repo.createSalaryStructure` — never update/delete an existing row (research.md R1, FR-002);
  write `ActivityLog` (`action: "salary_structure.set"`, `entity: "SalaryStructure"`).
- [X] T009 [US1] Implement `getSalaryStructure(orgId, employeeId, asOfDate, requester)` in
  `apps/api/src/modules/payroll/service.ts`: `ADMIN`/`HR` can view any employee's; an `EMPLOYEE`
  can view only their own (`employeeId === requester.employeeId`) — else throw
  `DomainError("FORBIDDEN", ..., 403)`; `MANAGER` has no salary-structure view access at all
  (FR-009 — Managers get payslip view-only, not structures) — throw `FORBIDDEN` unconditionally
  for that role. Call `repo.findEffectiveSalaryStructure(orgId, employeeId, asOfDate ?? today)`;
  throw `DomainError("NOT_FOUND", ..., 404)` if none exists yet.
- [X] T010 [US1] Implement `apps/api/src/modules/payroll/controller.ts` `setSalaryStructure` and
  `getSalaryStructure` handlers: validate request body against `SetSalaryStructureRequestSchema`
  (exists), call the corresponding service functions, return the documented response shapes
  (contracts/payroll-api.md § POST/GET /payroll/salary-structures/:employeeId).
- [X] T011 [US1] Wire `POST /payroll/salary-structures/:employeeId`
  (`authorize("ADMIN", "HR")`) and `GET /payroll/salary-structures/:employeeId` (`authenticate`
  only — scope enforced in service, T009) in `apps/api/src/modules/payroll/routes.ts`; register
  both paths with `registry.registerPath(..., tags: ["Payroll"])` in
  `apps/api/src/lib/openapi.ts`, matching 001/002/003's tagged-single-registry pattern. Mount
  `payrollRouter` at `/api/payroll` in `apps/api/src/app.ts`.
- [X] T012 [US1] Implement `apps/web/components/modules/payroll/salary-structure-form.tsx`:
  `react-hook-form` + `zodResolver` using a client-local copy of
  `SetSalaryStructureRequestSchema`'s shape (basic, hra, a small dynamic list of named
  allowances, effective-from date), calls `POST /payroll/salary-structures/:employeeId` via
  `apiRequest`, HR/Admin-only per `user.role` from `AuthProvider`. Uses `useFieldArray` for the
  dynamic allowances list. **Bug found and fixed** while writing this component's tests
  (T029): the `hra` and `effectiveFrom` fields set `aria-invalid` on validation failure but had
  no visible error `<p>` element (only `basic` did) — a real user would see the field highlighted
  red with no explanation why. Fixed by adding the same inline error message pattern to both
  fields, matching `basic`'s.
- [X] T013 [US1] Run quickstart.md Scenario 1 end-to-end (set structure, retrieve it, set a
  second version with a later `effectiveFrom`, confirm `asOf` lookup returns the version in
  effect for a given date, confirm Employee self-view succeeds but edit and cross-employee view
  are refused). Verified live against the running API + seeded Postgres via curl: created two
  versions (Jan 2026 base, Oct 2026 raise); `asOf=2026-09-15` correctly returned the Jan version,
  not the future raise; Employee edit attempt correctly refused (403, via `authorize`
  middleware); Employee self-view succeeded (200); Employee cross-employee view correctly
  refused (403, service-layer scope check).

**Checkpoint**: User Story 1 fully functional — salary structures can be set and viewed with
correct scoping. This is the MVP (nothing to run payroll against yet, but the foundational input
exists and is independently valuable per spec's own framing).

---

## Phase 4: User Story 2 - HR runs payroll for a period and generates payslips (Priority: P1)

**Goal**: HR/Admin can trigger a payroll run for a period; every active employee with a salary
structure gets a payslip reflecting proration and unpaid-leave deductions; re-running replaces
rather than duplicates; employees without a structure are skipped and reported.

**Independent Test**: Trigger a payroll run for one period with employees both with and without
unpaid leave taken, confirm a payslip is generated for each with correct proportional deduction
(quickstart.md Scenario 2).

### Implementation for User Story 2

- [X] T014 [US2] Implement `computePayslipForEmployee(orgId, employee, periodMonth, periodYear)`
  in `apps/api/src/modules/payroll/service.ts`: compute `periodStart`/`periodEnd` from
  `periodMonth`/`periodYear`; look up the effective `SalaryStructure` via
  `repo.findEffectiveSalaryStructure(orgId, employee.id, periodEnd)` — return `{ skipped:
  "NO_SALARY_STRUCTURE" }` if none exists (FR-011); determine the employee's active range within
  the period (research.md R3): clip `periodStart` to `employee.dateOfJoining` if joined
  mid-period, clip `periodEnd` to `getOffboardedDate` (002's new export, T004) if offboarded
  mid-period; compute the proration ratio as `(active working days) / (total working days in
  period)` using weekday-only counting (research.md R3 — no holiday exclusion here, unlike leave
  balance math); apply that ratio to `basic`, `hra`, and each `allowances` value to get prorated
  `earnings`; call `getUnpaidLeaveDaysForPeriod` (003's new export, T005) for the *prorated*
  active range and multiply by the per-day rate implied by the prorated earnings to get
  `deductions.unpaidLeave` (research.md R2 — applied after proration, not double-counted); return
  `{ earnings, deductions, netPay: sum(earnings) - sum(deductions) }`.
- [X] T015 [US2] Implement `runPayroll(orgId, periodMonth, periodYear, actor)` in
  `apps/api/src/modules/payroll/service.ts` (research.md R5): call
  `repo.findActiveEmployeesForPeriod(orgId, periodStart, periodEnd)` (T006); for each employee,
  call `computePayslipForEmployee` (T014); for a computed result, `repo.upsertPayslip` keyed on
  `[employeeId, periodMonth, periodYear]` (the schema's existing unique constraint — a second
  run for the same period replaces every row via this upsert, never duplicates, FR-006/SC-005);
  for a `NO_SALARY_STRUCTURE` skip, collect into a `skipped` array instead of upserting anything
  (FR-011); write one `ActivityLog` row for the run itself (`action: "payroll.run"`, `entity:
  "PayrollRun"`, `entityId: "{periodYear}-{periodMonth}"`, `after: { periodMonth, periodYear,
  payslipCount, skipped }`) in the same transaction as the payslip upserts (constitution
  Principle IV); return `{ periodMonth, periodYear, payslipCount, skipped }`.
- [X] T016 [US2] Implement `apps/api/src/modules/payroll/controller.ts` `runPayroll` handler:
  validate request body against `RunPayrollRequestSchema` (exists), call `runPayroll` (T015),
  return 200 with `RunPayrollResponseSchema` shape (contracts/payroll-api.md § POST
  /payroll/runs).
- [X] T017 [US2] Wire `POST /payroll/runs` (`authorize("ADMIN", "HR")`) in
  `apps/api/src/modules/payroll/routes.ts`; register in OpenAPI (tags: ["Payroll"]).
- [X] T018 [US2] Implement `getPayslipsOrgWide(orgId, filters)` in
  `apps/api/src/modules/payroll/service.ts`: `repo.findPayslipsOrgWide(orgId, { employeeId,
  periodMonth, periodYear })` (FR-010 — HR/Admin, anyone in the company); implement
  `apps/api/src/modules/payroll/controller.ts` `listPayslipsOrgWide` handler; wire `GET
  /payroll/payslips` (`authorize("ADMIN", "HR")`) in `routes.ts`; register in OpenAPI.
- [X] T019 [US2] Implement `apps/web/components/modules/payroll/payroll-run-trigger.tsx`: a
  Client Component (month/year picker + "Run Payroll" button, HR/Admin-only) calling `POST
  /payroll/runs` via `apiRequest`, showing the returned `payslipCount` and any `skipped` entries
  clearly (not silently) after the run completes (FR-011). Rendered and confirmed live on HR's
  `/payroll` page (see T031's note).
- [X] T020 [US2] Run quickstart.md Scenario 2 (run payroll, confirm skip-and-report for an
  employee with no salary structure, re-run after fixing it, confirm no duplicate payslips) and
  Scenario 3 (unpaid-leave deduction reflects working days at the correct daily rate; an
  offboarded-mid-period employee's payslip is prorated to their last active day) end-to-end;
  confirm SC-001, SC-002, SC-005. Verified live against the running API + seeded Postgres via
  curl: first run for Sept 2026 correctly skipped 8 employees with `NO_SALARY_STRUCTURE`,
  produced exactly 1 payslip for the one employee with a structure (`netPay: 62000`, matching
  `basic+hra+transport` with no proration/deduction); re-running the same period left exactly 1
  payslip (same row, replaced, not duplicated); filing and approving 5 working days of unpaid
  leave and re-running correctly deducted `14090.909...` (`62000/22 weekdays × 5 days`,
  mathematically exact — SC-002's "zero discrepancies vs. manual calculation"); a freshly
  created employee offboarded mid-period (active Sept 1–14, a Monday, 10 of September's 22
  weekdays) was correctly prorated to `basic: 20000` (`44000 × 10/22`).

**Checkpoint**: User Stories 1 AND 2 both work independently — salary structures plus a working
payroll run with correct proration and unpaid-leave math. This is the feature's actual point per
spec's own "Why this priority" framing.

---

## Phase 5: User Story 3 - Employee views and downloads their own payslips (Priority: P2)

**Goal**: An Employee can list and open their own past payslips; a Manager can view (never edit)
their direct reports' payslips; neither can reach anyone else's.

**Independent Test**: As an Employee, after at least one payroll run, view payslip history and
open one payslip; confirm no other employee's payslips are reachable (quickstart.md Scenario 4).

### Implementation for User Story 3

- [X] T021 [US3] Implement `getMyPayslips(orgId, employeeId)` and `getMyPayslipById(orgId,
  employeeId, id)` in `apps/api/src/modules/payroll/service.ts`: the former returns
  `repo.findPayslipsForEmployee(orgId, employeeId, {})` newest-first (FR-008); the latter fetches
  via `repo.findPayslipById` and throws `DomainError("FORBIDDEN", ..., 403)` if the payslip's
  `employeeId !== employeeId` param (spec Acceptance Scenario 3 — direct cross-employee access
  refused), or `DomainError("NOT_FOUND", ..., 404)` if it doesn't exist in the org at all.
- [X] T022 [US3] Implement `getTeamPayslips(orgId, requester, filters)` in
  `apps/api/src/modules/payroll/service.ts` (research.md R6): call 002's `getTeamView(orgId,
  requester)` to get current direct reports, then `repo.findPayslipsForEmployees(orgId,
  reportIds, filters)` — computed live from current reporting-line data, same pattern as 003's
  approval queue (no stale assignment).
- [X] T023 [US3] Implement `apps/api/src/modules/payroll/controller.ts` `getMyPayslips`,
  `getMyPayslipById`, and `getTeamPayslips` handlers; wire `GET /payroll/payslips/me`,
  `GET /payroll/payslips/me/:id` (both `authenticate` only), and `GET /payroll/payslips/team`
  (`authorize("MANAGER")`) in `routes.ts`; register all three in OpenAPI (tags: ["Payroll"]).
  Confirm no `PATCH`/`PUT`/`DELETE` route exists anywhere in this module for `Payslip` — FR-007's
  "no direct edit" guarantee is structural (no such endpoint), not just unused (SC-004). Verified
  by grepping `routes.ts` for `.patch(`/`.put(`/`.delete(` — none found.
- [X] T024 [US3] Implement `apps/web/components/modules/payroll/payslip-list.tsx` (renders a
  list of payslips by period, role-aware: own list for Employee, team list for Manager, org list
  for HR/Admin) and `apps/web/components/modules/payroll/payslip-detail.tsx` (renders one
  payslip's earnings/deductions/net-pay breakdown, with a print-friendly / downloadable view —
  no server-side PDF generation in v0.1 scope, per contracts/payroll-api.md). Design decision
  made during implementation (confirmed with the user): contracts only expose
  `GET /payroll/payslips/me/:id` for self-access — there's no by-id endpoint for a Manager/HR
  viewing someone else's payslip, only the list endpoints (`/payslips/team`, `/payslips`) which
  already return full payslip objects. Rather than add a new backend endpoint, `PayslipList`
  opens the detail as an inline expansion using the payslip object already present in the list
  response it was given — no extra fetch, no new route, no new backend surface.
- [X] T025 [US3] Implement `apps/web/app/(app)/payroll/page.tsx`: Server Component that calls
  `GET /payroll/payslips/me` (Employee), `GET /payroll/payslips/team` (Manager), or
  `GET /payroll/payslips` (HR/Admin) server-side depending on `user.role`, renders
  `PayslipList` (T024) and, for HR/Admin, `PayrollRunTrigger` (T019); implement
  `apps/web/app/(app)/payroll/[employeeId]/page.tsx`: one employee's salary structure
  (`SalaryStructureForm`, T012, HR/Admin-editable) and payslip history, scoped by caller's role
  the same way T009's service function is.
- [X] T026 [US3] Run quickstart.md Scenario 4 end-to-end (Employee lists and opens own payslips,
  cross-employee access refused, Manager sees team payslips view-only) and confirm SC-003
  (locate and open a past payslip in under 30s) and SC-004 (structurally, no edit path exists).
  Verified live via curl against both the API and the real Next.js server-rendered pages with
  signed-in session cookies: Employee's `/payroll` page shows "Your pay history" with no "Run
  Payroll" trigger; HR's page shows the org-wide list plus the run trigger; HR's
  `/payroll/[employeeId]` detail page correctly renders the current structure, the new-version
  form, and payslip history; Manager's `/payroll` page shows "your direct reports" scoping with
  no run trigger. Backend-level cross-employee refusal and SC-004's structural guarantee
  confirmed earlier (T020/T023). SC-003's exact under-30s timing is the one thing that
  genuinely needs a person clicking through with a stopwatch.

**Checkpoint**: All three user stories independently functional — salary structures, payroll
runs with correct math, and scoped self-service/team/org payslip access.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that span all three stories.

- [X] T027 [P] Add Vitest unit tests for `apps/api/src/modules/payroll/service.ts` covering:
  effective-salary-structure lookup by `asOf` date, salary-structure view/edit scoping
  (Employee/Manager/HR/Admin), proration for joining mid-period, proration for offboarding
  mid-period (mock 002's `getOffboardedDate`), the unpaid-leave deduction (mock 003's
  `getUnpaidLeaveDaysForPeriod`), skip-and-report for a missing salary structure, and
  replace-not-duplicate on a second run for the same period (mock the repository's upsert call).
  14 tests added in `service.test.ts` (repository + cross-module services mocked — no live DB
  needed), all passing. The mid-period proration and unpaid-leave-deduction test cases assert
  the *exact* numeric results (e.g. `44000 × 8/22`, `unpaidLeave: 10000`) — matching what live
  curl verification (T020's note) also produced for the same shapes of scenario, confirming the
  unit tests and the real system agree.
- [X] T028 [P] Add Vitest unit tests for the two new cross-module exports: 002's
  `getOffboardedDate` (`apps/api/src/modules/employee/service.test.ts`) and 003's
  `getUnpaidLeaveDaysForPeriod` (`apps/api/src/modules/attendance/service.test.ts`) — each in
  its owning module's existing test file, not a new file, consistent with how each module
  already tests its own exports. 2 tests added to employee's file (24 total, was 22), 3 to
  attendance's (21 total, was 18) — including a test confirming a leave request's range is
  correctly clipped to the period's own bounds before counting.
- [X] T029 [P] Add Vitest + React Testing Library tests for
  `apps/web/components/modules/payroll/salary-structure-form.tsx` covering validation errors
  and successful submission. 4 tests added, all passing; frontend suite total now 13 tests (was
  9). This is what caught the missing-error-message bug documented in T012's note.
- [X] T030 [P] Confirm every `/payroll/*` endpoint appears in the generated OpenAPI document,
  correctly tagged `"Payroll"` so it groups under its own heading on the single `/docs` page
  (constitution Development Workflow § API documentation), matching 001/002/003's verification
  approach. Verified via `GET /openapi.json`: all 7 payroll endpoints present and correctly
  tagged `"Payroll"` (`POST`/`GET /salary-structures/{employeeId}`, `POST /runs`, `GET
  /payslips/me`, `GET /payslips/me/{id}`, `GET /payslips/team`, `GET /payslips`) alongside 001's
  5, 002's 7, and 003's 13 — 32 total, grouped into 4 headings on the single `/docs` page.
- [X] T031 Run the full quickstart.md checklist end-to-end (all 4 scenarios, all 5 success
  criteria) as final acceptance validation against a live, migrated, seeded database. All 4
  scenarios verified against the real running system: the API directly (curl) for business
  logic and math (proration, unpaid-leave deduction, replace-not-duplicate), and the actual
  Next.js server-rendered pages (curl against `localhost:3000` with real signed-in session
  cookies) for role-aware rendering — Employee/Manager/HR views all confirmed correct. SC-001,
  SC-002, SC-004, SC-005 fully confirmed (SC-002 to exact arithmetic precision, not just
  approximately). SC-003's literal under-30s wall-clock timing is the one criterion that
  genuinely needs a human clicking through the UI with a stopwatch.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories. T004/T005 touch
  002/003's own service.ts files (additive exports only) — coordinate if those modules are being
  worked on concurrently, though the additions are isolated new functions, not edits to existing
  ones.
- **User Story 1 (Phase 3)**: Depends on Foundational only (T006/T007, not T004/T005 — salary
  structures don't need the cross-module reads). This is the MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational (specifically T004/T005's cross-module
  reads) and on US1's `SalaryStructure` existing to compute from — sequence after US1.
- **User Story 3 (Phase 5)**: Depends on Foundational and on US2's `runPayroll` having produced
  at least one payslip to view — sequence after US2, though its own service functions
  (T021/T022) have no code dependency on US2's, only data.
- **Polish (Phase 6)**: Depends on all three stories being complete.

### Within Each User Story

- Repository (Phase 2, shared) → Service → Controller → Routes (each depends on the previous
  within the same story).
- Backend endpoint before the frontend page/component that calls it.

### Parallel Opportunities

- T002/T003 (Setup) in parallel.
- T004/T005 (Foundational — different modules' files) in parallel; T007 in parallel with
  T004-T006 once T006 is far enough along to know the repository shape T007's schemas describe.
- T027/T028/T029/T030 (Polish) in parallel.

---

## Parallel Example: Foundational Phase

```bash
# These touch different files and can run together:
Task: "Add getOffboardedDate to apps/api/src/modules/employee/service.ts"
Task: "Add getUnpaidLeaveDaysForPeriod to apps/api/src/modules/attendance/service.ts"
Task: "Extend apps/api/src/modules/payroll/schema.ts with new response schemas"
```

## Parallel Example: User Story 2

```bash
Task: "Implement computePayslipForEmployee in apps/api/src/modules/payroll/service.ts"
# then, once the response shape is confirmed:
Task: "Implement PayrollRunTrigger.tsx (apps/web)"
# in parallel with:
Task: "Implement getPayslipsOrgWide + GET /payroll/payslips wiring"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (cross-module reads, repository, schema) — CRITICAL, blocks
   everything else.
3. Complete Phase 3: User Story 1 (salary structures, correctly scoped and versioned).
4. **STOP and VALIDATE**: run quickstart.md Scenario 1.
5. Demo: HR can define compensation for employees, versioned over time. Nothing to pay out yet
   (US2 does that), but the foundational input exists and is independently valuable per spec's
   own framing.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. User Story 1 → validate → demo.
3. User Story 2 next (the actual payroll run — "the entire point of the feature" per spec) →
   validate → demo.
4. User Story 3 (employee/manager self-service view) → validate → demo.
5. Polish.

### Parallel Team Strategy

With multiple developers, after Foundational completes:
- Developer A: User Story 1 (salary structures, both apps).
- Developer B: waits for US1's `SalaryStructure` write path to exist, then builds User Story 2's
  `runPayroll` computation and endpoint.
- Developer C: User Story 3's read-only payslip endpoints (T021-T023) can be scaffolded in
  parallel with US2 since they don't depend on US2's code, only on payslips existing to actually
  return data during testing.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- US1 and US2 are both P1; US3 is P2 — spec.md explicitly ranks self-service payslip viewing
  after the run itself exists to view, unlike 003 where all three stories were P1.
- Every task that touches `SalaryStructure`/`Payslip` reads existing field definitions from
  data-model.md rather than inventing new ones — no migration task exists in this list because
  none is needed (plan.md Storage).
- This feature reuses 001-auth-rbac's `authenticate`/`authorize` middleware and
  002-employee-management's exported `getEmployee`/`getTeamView` functions as-is, and adds two
  new small read-only exports to 002 and 003's own service.ts files (T004/T005) rather than
  querying their tables directly (constitution Principle I).
- Commit after each task or logical group.
- Stop at any checkpoint to validate a story independently via quickstart.md.
