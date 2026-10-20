---

description: "Task list for Employee Management"
---

# Tasks: Employee Management

**Input**: Design documents from `/specs/002-employee-management/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/employee-api.md,
quickstart.md

**Tests**: Not explicitly requested in the feature specification — no dedicated test-writing
tasks are included. `quickstart.md`'s scenarios serve as the manual/automated acceptance
validation at the end of each story, following the same precedent as 001-auth-rbac.

**Organization**: Tasks are grouped by user story (spec.md: US1, US2, US3 — priorities P1, P1,
P2) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- File paths are exact, relative to repo root

## Path Conventions

Web app layout already scaffolded in this repo: `apps/api/src/...` (backend), `apps/web/...`
(frontend). See plan.md § Project Structure for the full existing-file map. `Employee`,
`Department`, `Designation`, and `User` Prisma models already exist in
`apps/api/prisma/schema.prisma` — no migration task is needed (plan.md Storage, data-model.md).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the ground this feature builds on is in place before any employee-module
code is written. Most of this already exists from 001-auth-rbac — verify, don't recreate.

- [X] T001 Verify `apps/api/src/middleware/authenticate.ts` and `authorize.ts` (built in
  001-auth-rbac) are importable as-is by `apps/api/src/modules/employee/routes.ts` — no changes
  needed, this task is a sanity check before wiring routes in Phase 2. Confirmed: both export
  plain functions with no auth-module-specific coupling (`authenticate` reads `req.user` off
  `AccessTokenPayload`, `authorize(...roles)` is role-list-generic) — importable as-is.
- [X] T002 [P] Verify at least one seeded `Department` and `Designation` row exists per org in
  `apps/api/prisma/seed.ts` (needed for quickstart.md scenarios and for manually testing the
  create-employee form); add minimal seed rows (e.g. "Engineering", "Software Engineer") if
  missing. Confirmed already present: `seed.ts` upserts an "Engineering" department and
  "Software Engineer" designation for `ORG_ID`, used by all four seeded role accounts — no
  changes needed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Repository/service primitives every user story depends on — employee code
generation, manager-cycle validation, and directory-scope branching are all shared logic.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Implement `apps/api/src/modules/employee/repository.ts`: `createEmployee(data)`,
  `findEmployeeById(orgId, id)`, `findEmployeeByEmail(orgId, email)`, `updateEmployee(id, data)`,
  `countEmployees(orgId)` (for employee-code generation, research.md R1), `listEmployees(orgId,
  where)`, `findDepartments(orgId)`, `createDepartment(orgId, name)`, `findDesignations(orgId)`,
  `createDesignation(orgId, title, level?)` — Prisma queries only, per constitution Principle I
  (no other module imports this file). `updateEmployee` takes `Prisma.EmployeeUncheckedUpdateInput`
  (not the checked variant) so scalar FK fields (`departmentId`/`designationId`/`managerId`) can
  be set directly, matching `createEmployee`'s existing use of the unchecked create variant.
- [X] T004 Implement `generateEmployeeCode(orgId)` in `apps/api/src/modules/employee/service.ts`:
  format `EMP-{sequential number, zero-padded to 5 digits}` (research.md R1) using
  `repo.countEmployees(orgId) + 1`; catch a unique-constraint violation on create as a signal to
  retry once with a re-counted value (handles the documented race, research.md R1).
- [X] T005 Implement `validateManagerAssignment(orgId, employeeId, candidateManagerId)` in
  `apps/api/src/modules/employee/service.ts`: reject if `candidateManagerId === employeeId`
  (direct self-reference, FR-004); walk the candidate's own `managerId` chain (bounded by
  `repo.countEmployees(orgId)` iterations as a safety cap) and reject if `employeeId` appears in
  it (transitive cycle, research.md R2); reject if the candidate manager's `status !==
  "ACTIVE"` (spec Edge Cases — offboarded manager). Throws `DomainError("MANAGER_INVALID", ...,
  409)` on any violation (contracts/employee-api.md).
- [X] T006 Implement `listEmployeesForRequester(orgId, requester)` in
  `apps/api/src/modules/employee/service.ts` (research.md R3): `ADMIN`/`HR` → all employees in
  org (optionally filtered by `department`/`designation`/`status` query params per FR-006);
  `MANAGER` → own record + `where: { managerId: requester.employeeId }`; `EMPLOYEE` → own record
  only via `repo.findEmployeeById`.
- [X] T007 [P] Implement `searchDirectory(orgId, query)` in
  `apps/api/src/modules/employee/service.ts` (research.md R3): returns `{ id, name,
  departmentId, designationId }` for every `ACTIVE` employee in the org matching an optional
  name/department/designation filter — available to any authenticated role, no field beyond
  these four ever included (FR-006, spec Acceptance Scenario "not restricted fields like
  salary").
- [X] T008 [P] Extend `apps/api/src/modules/employee/schema.ts` per contracts/employee-api.md §
  Schema additions: add optional `role: RoleSchema.optional()` to `CreateEmployeeRequestSchema`
  (imports `RoleSchema` from `../auth/schema.js`); add `CreateEmployeeResponseSchema`
  (`EmployeeSchema.extend({ temporaryPassword: z.string() })`); add
  `EmployeeListResponseSchema` (`z.array(EmployeeSchema)`); add `DirectoryEntrySchema` (`{ id:
  z.string(), name: z.string(), departmentId: z.string().nullable(), designationId:
  z.string().nullable() }`) and `DirectoryResponseSchema` (`z.array(DirectoryEntrySchema)`); add
  `TeamViewResponseSchema` (`{ manager: DirectoryEntrySchema.nullable(), directReports:
  z.array(DirectoryEntrySchema) }`). Also narrowed `UpdateEmployeeRequestSchema` to drop the
  `status` field it previously (incorrectly) inherited from `CreateEmployeeRequestSchema.partial()`
  — offboarding must only happen through the dedicated endpoint (data-model.md), never a general
  `PATCH { status }`, so the schema no longer allows it at all.

**Checkpoint**: Repository, employee-code generation, manager validation, and directory-scope
logic all exist. User story implementation can now begin.

---

## Phase 3: User Story 1 - HR onboards a new employee (Priority: P1) 🎯 MVP

**Goal**: HR/Admin can create an employee record (with required fields validated) that
immediately appears in the directory and has a working linked login account.

**Independent Test**: Create one employee end-to-end via `POST /employees`, confirm it appears
in `GET /employees`, and sign in as the new employee using the returned temporary password
(quickstart.md Scenario 1).

### Implementation for User Story 1

- [X] T009 [US1] Implement `createEmployee(orgId, input, actor)` in
  `apps/api/src/modules/employee/service.ts`: validate required fields are present (`name`,
  `email`, `departmentId`, `designationId`, `dateOfJoining` — FR-001; `zod` schema handles this
  before the service layer, this task handles the business-rule validation: `email` uniqueness
  within org, `MANAGER_INVALID` via T005 if `managerId` provided); generate `employeeCode` (T004);
  in one Prisma transaction: create the `Employee` row, generate a random temporary password,
  bcrypt-hash it (cost 12, matching 001's `BCRYPT_COST`), create the linked `User` row (`role`
  from input or default `EMPLOYEE`, `employeeId` = new employee's id, per data-model.md § User);
  write `ActivityLog` (`action: "employee.created"`, `entity: "Employee"`, actor =
  `actor.employeeId`, FR-011). Return the created employee plus the plaintext
  `temporaryPassword` (returned once, never stored in plaintext, never logged — research.md R4).
  Verified end-to-end against the live dev API + seeded Postgres: generated code `EMP-00005`,
  temp password worked for an immediate sign-in.
- [X] T010 [US1] Implement `apps/api/src/modules/employee/controller.ts` `createEmployee`
  handler: validate request body against `CreateEmployeeRequestSchema` (T008), call service
  (T009), return 201 with `CreateEmployeeResponseSchema` shape (contracts/employee-api.md § POST
  /employees). Map `MANAGER_INVALID`/`EMAIL_TAKEN` domain errors to their documented status
  codes via the existing central `errorHandler.ts` (no new try/catch, per constitution
  Development Workflow's error-shape rule).
- [X] T011 [US1] Implement `getEmployee(orgId, id, requester)` in
  `apps/api/src/modules/employee/service.ts`: `ADMIN`/`HR` can fetch any employee in org;
  `MANAGER` can fetch self or a direct report (`employee.managerId === requester.employeeId`);
  `EMPLOYEE` can only fetch self (`id === requester.employeeId`) — else throw
  `DomainError("FORBIDDEN", ..., 403)` (contracts/employee-api.md § GET /employees/:id, FR-005/
  FR-007). Throw `DomainError("NOT_FOUND", ..., 404)` if no matching employee in org.
- [X] T012 [US1] Wire `POST /employees` and `GET /employees/:id` in
  `apps/api/src/modules/employee/routes.ts`: `authenticate` + `authorize("ADMIN", "HR")` for
  POST; `authenticate` only for GET (scope enforced in service, T011); register both paths with
  `registry.registerPath(...)` in `apps/api/src/lib/openapi.ts`, matching 001's pattern. Mount
  `employeeRouter` at `/api/employees` in `apps/api/src/app.ts`. Also mounted `departmentRouter`
  at `/api/departments` and `designationRouter` at `/api/designations` in the same edit (needed
  by T017, wired together since they're in the same routes.ts file).
- [X] T013 [US1] Implement `apps/web/lib/api-client.ts`-consuming
  `apps/web/components/modules/employee/EmployeeForm.tsx`: `react-hook-form` + `zodResolver`
  using a client-local copy of `CreateEmployeeRequestSchema`'s shape (name, email, department
  dropdown, designation dropdown, manager dropdown (optional), joining date), calls `POST
  /employees` via `apiRequest`, shows field-specific errors on 400 `VALIDATION_ERROR`
  (FR-001, spec Acceptance Scenario 3) and a distinct message for 409 `MANAGER_INVALID`/
  `EMAIL_TAKEN`, and on success displays the returned `temporaryPassword` once in a
  dismissable confirmation panel (research.md R4 — HR communicates it out-of-band; the UI never
  persists or re-shows it after dismissal). Built as `employee-form.tsx` (kebab-case, matching
  this repo's actual file-naming convention — `EmployeeForm.tsx` in the task description was
  illustrative, not literal; same as every other component file in `components/`).
  **Bug found and fixed** (same class as 001's `FormInput` fix, documented in that component's
  own comment): the inline `NativeSelect` wrapper around a plain `<select>` wasn't wrapped in
  `React.forwardRef`, so `register()`'s ref silently never reached the DOM element and RHF never
  received the department/designation/manager dropdown values. Caught by `employee-form.test.tsx`
  (T029) before ever reaching a real browser — fixed by wrapping in `React.forwardRef`.
- [X] T014 [US1] Implement `apps/web/app/(app)/employees/page.tsx`: Server Component that calls
  `GET /employees` server-side (role-scoped per T006), renders a table (name, employeeCode,
  department, designation, status), and includes an "Add Employee" action (HR/Admin only, per
  `user.role` from `AuthProvider`) that opens `EmployeeForm` (T013) in a modal/panel. Built as an
  inline expandable panel rather than a modal dialog — no shadcn Dialog component exists yet in
  this repo, and adding one for a single use site would be premature (constitution Principle
  VII). After a successful create, calls `router.refresh()` so the Server Component's `GET
  /employees` re-fetches and the new hire appears in the list without a full page reload.
- [X] T015 [US1] Run quickstart.md Scenario 1 end-to-end (create employee, confirm directory
  listing, sign in as the new employee with the temporary password, confirm missing-field
  rejection) and confirm SC-001 (onboarding completes in under 2 minutes). Verified via the
  real Next.js server-rendered pages (curl against `localhost:3000` with a signed-in session
  cookie, since no visual browser was available in this environment): the HR-role directory page
  renders the "Add Employee" panel and, after a successful create in the component tests, the
  page correctly re-fetches via `router.refresh()`. SC-001's exact under-2-minutes timing is a
  human-clicking-through-the-form measurement that a curl-driven check can't fully replicate —
  flagging that the *form flow itself* (fields, validation, submit, success state) is
  confirmed fast and friction-free via T013's tests and the rendered HTML, but a literal
  stopwatch run by a person is recommended before treating SC-001 as formally closed.

**Checkpoint**: User Story 1 fully functional — HR can onboard an employee who can immediately
sign in. This is the MVP.

---

## Phase 4: User Story 2 - Anyone finds and views the employee directory appropriate to their role (Priority: P1)

**Goal**: Employee/Manager/HR/Admin each see a directory scoped correctly to their role, with
search/filter support.

**Independent Test**: Search and open a profile as each of the four roles and confirm the
visible set of employees matches the intended scope (quickstart.md Scenario 3).

### Implementation for User Story 2

- [X] T016 [US2] Wire `GET /employees` (list, scoped per T006, with `department`/`designation`/
  `status` query-param filters per FR-006) and `GET /employees/directory` (basic-info search per
  T007) in `apps/api/src/modules/employee/routes.ts`: both require `authenticate` only (no role
  restriction — scope is enforced inside the service functions); register both in OpenAPI.
  **Bug found and fixed while verifying end-to-end**: `listEmployeesForRequester` (T006) did not
  filter by status by default, so offboarded employees kept appearing in Manager/HR/Admin list
  views — violating spec User Story 3 Acceptance Scenario 2 ("no longer appear in active
  employee lists"). Fixed by defaulting the `where` clause to `status: "ACTIVE"` unless the
  caller explicitly passes a `status` query param; verified live that a default `GET /employees`
  now excludes an offboarded employee while `?status=OFFBOARDED` still surfaces them.
- [X] T017 [US2] Wire `GET /departments` and `GET /designations` (read-only lookup lists, any
  authenticated user) in `routes.ts` → `controller.ts` → `repo.findDepartments`/
  `findDesignations`; register in OpenAPI (contracts/employee-api.md § GET /departments, GET
  /designations). Also wired the `POST` counterparts (Admin/HR only) in the same pass since
  they're needed to test T009 without manual DB seeding — verified live: create, and
  duplicate-name rejection (`DEPARTMENT_EXISTS`/`DESIGNATION_EXISTS`, 409), both work.
- [X] T018 [US2] Implement `apps/web/app/(app)/employees/page.tsx`'s search/filter UI
  (extends T014): a search box calling `GET /employees/directory?q=` for
  Employee-role users, versus the full `GET /employees?department=&designation=&status=` list
  for Manager/HR/Admin — branch the fetch and the rendered columns by `user.role` from
  `AuthProvider` (Employee sees name/department/title only; Manager/HR/Admin see full rows).
  Built as `employee-directory.tsx`: the Server Component (`page.tsx`) fetches both
  `/employees/directory` and `/employees` server-side and passes both down, and the client
  component branches which one to render/filter based on `role` — search filtering itself
  happens client-side against the already-fetched list (no per-keystroke API round-trip) since
  the seeded/expected data volume for v0.1 is small (Principle VII).
- [X] T019 [US2] Implement `apps/web/app/(app)/employees/[id]/page.tsx`: Server Component that
  calls `GET /employees/:id` server-side; renders 403 as a friendly "not permitted" message
  (not a crash/blank page) when the API returns `FORBIDDEN` (spec User Story 3 Acceptance
  Scenario 3's "not permitted" pattern, reused here for consistency with 001's SC-004 standard).
  Also renders a distinct "not found" state for 404. Verified live (see T020/T027 notes):
  Employee's own-profile fetch renders full details; fetching another employee's profile
  renders the friendly permission message instead of erroring.
- [X] T020 [US2] Run quickstart.md Scenario 3 end-to-end (directory search as Employee, 403 on
  cross-employee fetch, own-record fetch, Manager's team-scoped list, HR/Admin's org-wide
  filtered search) and confirm SC-002 (zero over/under-exposure across all four roles). Verified
  twice: first at the API layer (see original note below), then again through the actual
  Next.js server-rendered pages once T018/T019 existed — fetched `/employees` and
  `/employees/[id]` through `localhost:3000` with a real signed-in session cookie and confirmed
  the rendered HTML: Employee role sees the directory with no "Add Employee" button and no
  email/managerId columns; HR role sees the full table plus "Add Employee"; a profile fetch for
  someone outside the viewer's scope renders the friendly "don't have permission" text, not a
  crash. Original API-only note: Employee's directory search returned only
  `{id, name, departmentId, designationId}` with no email/managerId leak; Employee's own-record
  fetch succeeded, cross-employee fetch correctly 403'd; Manager's default list correctly showed
  only self + direct reports.

**Checkpoint**: User Stories 1 AND 2 both work independently — onboarding plus role-scoped
directory/search.

---

## Phase 5: User Story 3 - HR updates or offboards an employee (Priority: P2)

**Goal**: HR can edit an employee's department/designation/manager with changes reflected
immediately everywhere, and offboard (never hard-delete) an employee, preserving history and
revoking access.

**Independent Test**: Reassign an employee's manager and confirm both the old and new manager's
team views update; offboard an employee and confirm they disappear from active lists, can't sign
in, but their historical records remain (quickstart.md Scenario 4).

### Implementation for User Story 3

- [X] T021 [US3] Implement `updateEmployee(orgId, id, input, actor)` in
  `apps/api/src/modules/employee/service.ts`: apply `departmentId`/`designationId`/`managerId`
  changes from `UpdateEmployeeRequestSchema` (FR-003); if `managerId` is present in the input,
  re-run `validateManagerAssignment` (T005) against the new value; write `ActivityLog`
  (`action: "employee.updated"`, `before`/`after` capturing only the changed fields, FR-011).
  Does NOT accept a `status` field — offboarding is a separate action (T022), per
  data-model.md's note that status changes must always go through the audited,
  session-revoking offboard path.
- [X] T022 [US3] Implement `offboardEmployee(orgId, id, actor)` in
  `apps/api/src/modules/employee/service.ts` (research.md R5): throw
  `DomainError("NOT_FOUND", ..., 404)` if no such employee in org; throw
  `DomainError("ALREADY_OFFBOARDED", ..., 409)` if `status` is already `OFFBOARDED`; else set
  `status = "OFFBOARDED"`, call 001's exported `revokeAllSessionsForUser(employee.user.id)` (only
  if a linked `User` exists), write `ActivityLog` (`action: "employee.offboarded"`, `before: {
  status: "ACTIVE" }`, `after: { status: "OFFBOARDED" }`, FR-011) — all in one service call, no
  other module's data touched (FR-007, SC-004).
- [X] T023 [US3] Wire `PATCH /employees/:id` and `POST /employees/:id/offboard` in
  `apps/api/src/modules/employee/routes.ts`: both require `authenticate` +
  `authorize("ADMIN", "HR")` (FR-003, FR-007); register both in OpenAPI
  (contracts/employee-api.md).
- [X] T024 [US3] Implement `getTeamView(orgId, requester)` in
  `apps/api/src/modules/employee/service.ts`: returns `{ manager, directReports }` for the
  calling Manager — `manager` is `null` if the Manager has no manager of their own;
  `directReports` is `repo.listEmployees(orgId, { managerId: requester.employeeId })` mapped to
  `DirectoryEntrySchema` shape, an empty array (not an error) when there are none (FR-010, spec
  Edge Cases).
- [X] T025 [US3] Wire `GET /employees/me/team` in `routes.ts`: `authenticate` +
  `authorize("MANAGER")`; register in OpenAPI (contracts/employee-api.md § GET
  /employees/me/team).
- [X] T026 [US3] Implement `apps/web/app/(app)/employees/[id]/page.tsx`'s edit form (extends
  T019): HR/Admin-only "Edit" action opening a form pre-filled from `GET /employees/:id`,
  submitting `PATCH /employees/:id`; a separate "Offboard" action (with a confirmation dialog,
  since it's irreversible in this feature) calling `POST /employees/:id/offboard`. Built as
  `employee-profile.tsx`: "Edit" swaps the details card into an inline pre-filled form (same
  no-modal-dependency reasoning as T014); "Offboard" opens an inline confirmation card
  (department/designation/manager selects intentionally hidden while confirming, so the only
  visible action is confirm-or-cancel) before calling the API. Both actions call
  `router.refresh()` on success so the Server Component re-fetches the now-current record.
  Reused the same `React.forwardRef`-wrapped `NativeSelect` pattern (T013's bug fix) here too —
  written correctly from the start this time, not a second occurrence of the bug.
- [X] T027 [US3] Run quickstart.md Scenario 4 (manager reassignment propagation, offboarding,
  sign-in rejection, historical-record preservation) and Scenario 5 (self-reference and cycle
  rejection) end-to-end; confirm SC-003 (same-session visibility of org-chart changes) and SC-004
  (zero data loss on offboarding). Verified live against the seeded database (backend only —
  T026's UI not yet built): manager reassignment correctly moved an employee out of the old
  manager's `directReports` and into the new one's on the very next fetch (SC-003); offboarding
  set `status: OFFBOARDED`, blocked sign-in (401 `INVALID_CREDENTIALS`), rejected a second
  offboard attempt (`ALREADY_OFFBOARDED`, 409), and rejected assigning the offboarded employee as
  someone else's manager (`MANAGER_INVALID`, 409); `ActivityLog` rows confirmed written for
  create/update/offboard actions (FR-011, SC-004 — nothing else touched or deleted). Scenario 5's
  self-reference and transitive-cycle (A→B→C→A) rejections both confirmed via direct API calls.
  Re-verified after T026 landed that HR's rendered profile page shows both "Edit" and "Offboard"
  actions on another employee's profile (confirmed via the real server-rendered page, not just
  the API).

**Checkpoint**: All three user stories independently functional — onboarding, role-scoped
directory, and update/offboard with full audit trail.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that span all three stories.

- [X] T028 [P] Add Vitest unit tests for `apps/api/src/modules/employee/service.ts` covering:
  employee-code generation sequencing, manager self-reference rejection, manager transitive-cycle
  rejection, offboarded-manager rejection, directory scoping per role (Employee/Manager/HR/Admin),
  and offboarding's session-revocation side effect (mock 001's `revokeAllSessionsForUser`).
  22 tests added in `service.test.ts` (repository + auth service mocked — no live DB needed),
  all passing; backend suite total now 31 tests (was 9).
- [X] T029 [P] Add Vitest + React Testing Library tests for
  `apps/web/components/modules/employee/EmployeeForm.tsx` covering the required-field validation
  errors and the one-time temporary-password display. 3 tests added in `employee-form.test.tsx`
  covering required-field errors, the `MANAGER_INVALID` API error message, and the temporary
  password display + dismissal; all passing (frontend suite total now 6 tests, was 3). This test
  is what caught T013's `NativeSelect`/`forwardRef` bug before it reached a browser — the first
  run failed with `apiRequest` never being called, tracing back to react-hook-form never
  receiving the select fields' values.
- [X] T030 [P] Confirm every `/employees`, `/departments`, and `/designations` endpoint appears
  in the generated OpenAPI document and is browsable via Swagger UI in dev (constitution
  Development Workflow § API documentation), matching 001's verification approach. Verified via
  `GET /openapi.json`: all 7 employee-module paths present (`/employees`, `/employees/directory`,
  `/employees/me/team`, `/employees/{id}`, `/employees/{id}/offboard`, `/departments`,
  `/designations`) alongside 001's 5 auth paths — 12 total.
- [X] T031 Run the full quickstart.md checklist end-to-end (all 5 scenarios, all 4 success
  criteria) as final acceptance validation against a live, migrated, seeded database. All 5
  scenarios verified against the real, running system: the API directly (curl) for the business
  logic, and the actual Next.js server-rendered pages (curl against `localhost:3000` with real
  signed-in session cookies, since no visual browser was available in this environment) for the
  UI layer — role-scoped directory rendering, the "Add Employee" panel's visibility, the profile
  page's Edit/Offboard actions, and the friendly 403 message were all confirmed in the rendered
  HTML. SC-001's precise "under 2 minutes" wall-clock timing is the one criterion that
  genuinely needs a human clicking through the form to close out formally — everything else
  (SC-002, SC-003, SC-004) is fully confirmed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only. This is the MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational; T018/T019 extend US1's T014 UI, so best
  implemented after US1's Phase 3 checkpoint, though the backend endpoints (T016/T017) have no
  hard dependency on US1's code.
- **User Story 3 (Phase 5)**: Depends on Foundational; T026 extends US1's T014/US2's T019 UI, so
  best implemented after both; T022 depends on 001's exported `revokeAllSessionsForUser` (already
  built, no new dependency to add).
- **Polish (Phase 6)**: Depends on all three stories being complete.

### Within Each User Story

- Repository (Phase 2, shared) → Service → Controller → Routes (each depends on the previous
  within the same story).
- Backend endpoint before the frontend page/component that calls it.

### Parallel Opportunities

- T001/T002 (Setup) in parallel.
- T007/T008 (Foundational — different files) in parallel once T003-T006 land.
- Within US1: T013 (frontend form) can start once T010's response shape is settled, in parallel
  with T011-T012 (backend GET /employees/:id wiring).
- US2's backend tasks (T016/T017) can proceed in parallel with US1's frontend tasks (T013/T014)
  once Phase 2 is done, since they touch different files — though the *UI* tasks (T018/T019) are
  sequenced after US1's T014 for practical reasons (same file).
- T028/T029/T030 (Polish) in parallel.

---

## Parallel Example: Foundational Phase

```bash
# After T003-T006 (repository/service core) complete, these can run together:
Task: "Implement searchDirectory in apps/api/src/modules/employee/service.ts"
Task: "Extend apps/api/src/modules/employee/schema.ts with new response schemas"
```

## Parallel Example: User Story 1

```bash
Task: "Implement createEmployee in apps/api/src/modules/employee/service.ts"
# then, once the response shape is confirmed:
Task: "Implement EmployeeForm.tsx (apps/web)"
# in parallel with:
Task: "Implement getEmployee + GET /employees/:id wiring"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (repository, employee-code generation, manager validation,
   directory-scope logic) — CRITICAL, blocks everything else.
3. Complete Phase 3: User Story 1 (onboard + linked login).
4. **STOP and VALIDATE**: run quickstart.md Scenario 1, confirm SC-001.
5. Demo: HR can onboard an employee who can sign in immediately. Directory search/filter (US2)
   and update/offboard (US3) still needed before this is production-ready, but the core
   system-of-record write path is demoable here.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. User Story 1 → validate → demo (MVP).
3. User Story 2 next (also P1 — equally critical per spec, the directory is "the first thing
   people check") → validate → demo.
4. User Story 3 → validate → demo.
5. Polish.

### Parallel Team Strategy

With multiple developers, after Foundational completes:
- Developer A: User Story 1 (onboarding flow, both apps).
- Developer B: User Story 2's directory/search endpoints and UI — independent of US1's form work
  once the schema (T008) exists.
- Developer C: User Story 3's update/offboard logic (T021-T025) — independent of US1/US2's UI
  work, though its own UI (T026) depends on US1/US2's page shell existing first.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- US1 and US2 are both P1 — spec.md treats onboarding and the directory as equally critical
  first-class flows, not sequential nice-to-haves.
- Every task that touches `Employee`/`Department`/`Designation` reads existing field
  definitions from data-model.md rather than inventing new ones — no migration task exists in
  this list because none is needed (plan.md Storage).
- This feature reuses 001-auth-rbac's `authenticate`/`authorize` middleware and exported
  `revokeAllSessionsForUser` function as-is — no changes to 001's code are anticipated by any
  task here.
- Commit after each task or logical group.
- Stop at any checkpoint to validate a story independently via quickstart.md.

## What's left (2026-09-14 implementation pass)

All 31 of 31 tasks complete. Backend (`repository.ts`, `service.ts`, `controller.ts`,
`schema.ts`, `routes.ts`, mounted in `app.ts`) and frontend (`employee-form.tsx`,
`employee-directory.tsx`, `employee-profile.tsx`, and the three page files) are both fully
implemented. Both apps typecheck/build cleanly (the one pre-existing, unrelated `pino-http`
error in `apps/api/app.ts` predates this feature, same as noted in 001's tasks.md). 37 automated
tests pass: 31 backend (9 from 001 + 22 new) and 6 frontend (3 from 001's login page + 3 new for
`EmployeeForm`).

**Verified live against the running dev API + Next.js server + seeded Postgres** (curl against
both `localhost:4000` and `localhost:3000` with real signed-in session cookies, since no visual
browser was available in this environment):
- Scenario 1 (onboarding): employee created with a generated `EMP-00005` code, appeared in the
  directory immediately, new hire signed in successfully with the returned temporary password,
  missing-field submission correctly rejected with `VALIDATION_ERROR`; the rendered directory
  page shows the "Add Employee" panel for HR/Admin only.
- Scenario 2 (manager assignment): assigning a manager correctly surfaced the employee in that
  manager's `GET /employees/me/team` response.
- Scenario 3 (role-scoped directory): Employee's directory search returned only basic fields (no
  email/managerId leak), 403 on fetching another employee's full record renders a friendly
  message (not a crash), Manager's default list correctly limited to self + direct reports; the
  rendered pages confirm the same scoping visually (no "Add Employee" or email column for
  Employee role).
- Scenario 4 (update/offboard): manager reassignment moved the employee between team views on
  the very next fetch; offboarding blocked sign-in, rejected a duplicate offboard
  (`ALREADY_OFFBOARDED`), and `ActivityLog` rows were confirmed written for create/update/
  offboard; HR's rendered profile page shows both Edit and Offboard actions on another
  employee's profile.
- Scenario 5 (cycle rejection): both direct self-reference and a 3-node transitive cycle
  (A→B→C→A) were correctly rejected with `MANAGER_INVALID`; assigning an offboarded employee as
  a manager was also rejected.

**Two real bugs found and fixed during this pass, neither caught by the mocked unit tests**:
1. `listEmployeesForRequester` had no default status filter, so offboarded employees kept
   appearing in every role's directory/list view — directly violating spec User Story 3
   Acceptance Scenario 2. Fixed by defaulting to `status: "ACTIVE"` unless the caller explicitly
   requests a different status. Found via live API verification (T016).
2. The frontend's inline `NativeSelect` wrapper (used for department/designation/manager
   dropdowns in both the create and edit forms) wasn't wrapped in `React.forwardRef`, so
   react-hook-form's `register()` ref never reached the actual `<select>` element and dropdown
   values were silently never captured — the exact same bug class 001 hit and documented in
   `FormInput`'s own comment. Found by `employee-form.test.tsx` (T029) failing with `apiRequest`
   never called, before ever reaching a browser. Fixed by wrapping in `React.forwardRef` in both
   `employee-form.tsx` and `employee-profile.tsx`.

**Not formally closed**: SC-001's exact "under 2 minutes" wall-clock onboarding time is the one
success criterion that genuinely needs a human clicking through the real form with a stopwatch —
everything else (SC-002, SC-003, SC-004, and the form's correctness/speed of interaction) is
confirmed via the rendered pages and passing tests.
