---

description: "Task list for Attendance & Leave"
---

# Tasks: Attendance & Leave

**Input**: Design documents from `/specs/003-attendance-leave/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/attendance-leave-api.md, quickstart.md

**Tests**: Not explicitly requested in the feature specification — no dedicated test-writing
tasks are included. `quickstart.md`'s scenarios serve as the manual/automated acceptance
validation at the end of each story, following the same precedent as 001-auth-rbac and
002-employee-management.

**Organization**: Tasks are grouped by user story (spec.md: US1, US2, US3 — priorities P1, P1,
P1) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- File paths are exact, relative to repo root

## Path Conventions

Web app layout already scaffolded in this repo: `apps/api/src/...` (backend), `apps/web/...`
(frontend). See plan.md § Project Structure for the full existing-file map. `Attendance`,
`LeaveType`, `LeaveBalance`, `LeaveRequest`, `Holiday` Prisma models already exist in
`apps/api/prisma/schema.prisma` — no migration task is needed (plan.md Storage, data-model.md).
This feature calls 001's `authenticate`/`authorize` middleware and 002's exported employee
service functions (`getEmployee`, `getTeamView`) as-is — no changes to either module anticipated.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the ground this feature builds on is in place before any attendance/leave
code is written. Everything needed already exists from 001/002 — verify, don't recreate.

- [X] T001 Verify `apps/api/src/middleware/authenticate.ts` and `authorize.ts` (001) are
  importable as-is by `apps/api/src/modules/attendance/routes.ts` — no changes needed. Confirmed
  during 001/002's own implementation passes; both export plain, module-agnostic functions.
- [X] T002 [P] Verify `apps/api/src/modules/employee/service.ts`'s exported `getEmployee` and
  `getTeamView` (002) are importable as-is by `apps/api/src/modules/attendance/service.ts` for
  reporting-line/manager checks — no changes needed, and no direct `Employee` Prisma queries
  from this module (constitution Principle I). Confirmed both are exported with stable
  signatures (`getEmployee(orgId, id, requester)`, `getTeamView(orgId, requester)`).
- [X] T003 [P] Verify at least one `LeaveType` exists per org in `apps/api/prisma/seed.ts` for
  quickstart.md scenarios to be runnable; add a minimal seed row (e.g. `{ name: "Paid", isPaid:
  true, defaultDays: 20 }`) if missing. None existed — added an upsert for `{ orgId, name:
  "Paid", isPaid: true, defaultDays: 20 }` to `seed.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Repository primitives and the working-day calculation every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Implement `apps/api/src/modules/attendance/repository.ts`: `findAttendanceByDay(orgId,
  employeeId, date)`, `createAttendance(data)`, `updateAttendance(id, data)`,
  `findAttendanceRange(orgId, employeeId, from, to)`, `findHolidaysInRange(orgId, from, to)`,
  `findApprovedLeaveInRange(orgId, employeeId, from, to)`, `createLeaveRequest(data)`,
  `findLeaveRequestById(orgId, id)`, `updateLeaveRequest(id, data)`,
  `findPendingLeaveForManager(orgId, managerId)`, `findPendingLeaveOrgWide(orgId)`,
  `findLeaveBalance(orgId, employeeId, leaveTypeId, year)`, `createLeaveBalance(data)`,
  `updateLeaveBalance(id, data)`, `findLeaveTypes(orgId)`, `createLeaveType(orgId, data)`,
  `findHolidays(orgId, year?)`, `createHoliday(orgId, data)`, `writeActivityLog(params)` —
  Prisma queries only, per constitution Principle I (no other module imports this file).
- [X] T005 Implement `countWorkingDays(orgId, startDate, endDate)` in
  `apps/api/src/modules/attendance/service.ts` (research.md R1): iterate the date range
  day-by-day, skip Saturday/Sunday, skip any date present in `repo.findHolidaysInRange` for that
  range, return the count of remaining days. Used identically by both the balance check
  (FR-007) and the approval-time decrement (FR-010) so they can never disagree.
- [X] T006 [P] Implement `checkOverlap(orgId, employeeId, startDate, endDate)` in
  `apps/api/src/modules/attendance/service.ts` (research.md R2): returns `{ holidays:
  Holiday[], approvedLeave: LeaveRequest[] }` — non-blocking, informational only (spec FR-006
  "flags the overlap before submission," not a rejection condition).
- [X] T007 [P] Extend `apps/api/src/modules/attendance/schema.ts` per
  contracts/attendance-leave-api.md § Schema additions: add `AttendanceHistoryResponseSchema`
  (`z.array(AttendanceRecordSchema)`); add `CreateLeaveRequestResponseSchema`
  (`LeaveRequestSchema.extend({ overlaps: z.object({ holidays: z.array(HolidaySchema),
  approvedLeave: z.array(LeaveRequestSchema) }) })`); add `LeaveRequestListResponseSchema`
  (`z.array(LeaveRequestSchema)`); add `LeaveBalanceListResponseSchema`
  (`z.array(LeaveBalanceSchema)`); add `CreateLeaveTypeRequestSchema` (`{ name:
  z.string().min(1), isPaid: z.boolean(), defaultDays: z.number().nonnegative() }`); add
  `CreateHolidayRequestSchema` (`{ name: z.string().min(1), date: z.string().date(), region:
  z.string().optional() }`).

**Checkpoint**: Repository, working-day calculation, and overlap detection all exist. User story
implementation can now begin.

---

## Phase 3: User Story 1 - Employee checks in and out for the day (Priority: P1) 🎯 MVP

**Goal**: An Employee can check in, check out, and see today's status plus their attendance
history at a glance; duplicate check-in/out is prevented.

**Independent Test**: Check in, then check out, and confirm the day's record shows both times
and a computed status (quickstart.md Scenario 1).

### Implementation for User Story 1

- [X] T008 [US1] Implement `checkIn(orgId, employeeId)` in
  `apps/api/src/modules/attendance/service.ts`: look up today's `Attendance` row for
  `[employeeId, today]` (repo.findAttendanceByDay); throw `DomainError("ALREADY_CHECKED_IN", ...,
  409)` if `checkIn` is already set (FR-003, spec Acceptance Scenario 3); else create or update
  the row with `checkIn = now()` (FR-001).
- [X] T009 [US1] Implement `checkOut(orgId, employeeId)` in
  `apps/api/src/modules/attendance/service.ts`: throw `DomainError("NOT_CHECKED_IN", ..., 409)`
  if no row exists for today or `checkIn` is null; throw `DomainError("ALREADY_CHECKED_OUT", ...,
  409)` if `checkOut` is already set (FR-003); else set `checkOut = now()` and `status =
  "PRESENT"` (FR-001/FR-002 — hours worked is `checkOut - checkIn`, computed on read per
  data-model.md, not stored).
- [X] T010 [US1] Implement `getAttendanceHistory(orgId, employeeId, from, to)` in
  `apps/api/src/modules/attendance/service.ts`: fetch `repo.findAttendanceRange` for the range
  (defaulting to the current month if `from`/`to` omitted); for any date in the range with no
  row, synthesize `{ status: "ABSENT", checkIn: null, checkOut: null }` in the response
  (research.md R6) rather than omitting it, so the UI can render a complete calendar.
- [X] T011 [US1] Implement `apps/api/src/modules/attendance/controller.ts` `checkIn`, `checkOut`,
  and `getMyAttendance` handlers: call the corresponding service function with
  `req.user.employeeId`, return the documented response shapes
  (contracts/attendance-leave-api.md § POST /attendance/check-in, /check-out, GET
  /attendance/me).
- [X] T012 [US1] Wire `POST /attendance/check-in`, `POST /attendance/check-out`, and
  `GET /attendance/me` in `apps/api/src/modules/attendance/routes.ts`: all three require only
  `authenticate` (any authenticated user, FR-001); register all three paths with
  `registry.registerPath(...)` in `apps/api/src/lib/openapi.ts`, matching 001/002's pattern.
  Mount `attendanceRouter` at `/api/attendance` in `apps/api/src/app.ts`.
- [X] T013 [US1] Implement `apps/web/components/modules/attendance/check-in-out-card.tsx`: a
  Client Component showing today's status (not checked in / checked in at HH:MM / checked out,
  total hours) with a single "Check In" or "Check Out" button depending on state, calling
  `POST /attendance/check-in` or `/check-out` via `apiRequest`; shows a friendly message (not a
  raw error) on `ALREADY_CHECKED_IN`/`NOT_CHECKED_IN`/`ALREADY_CHECKED_OUT`.
- [X] T014 [US1] Implement `apps/web/app/(app)/attendance/page.tsx`: Server Component that calls
  `GET /attendance/me` server-side for the current month, renders `CheckInOutCard` (T013) plus a
  simple list/calendar of past days with status (present/absent/on leave/holiday, spec
  Acceptance Scenario 4) — a day with `checkIn` set but `checkOut` null (a past date) is
  rendered as visibly incomplete, not as a full day worked (spec Edge Cases). "Incomplete" shown
  as a distinct destructive-variant badge rather than the day's actual `PRESENT`/`ABSENT` status.
- [X] T015 [US1] Run quickstart.md Scenario 1 end-to-end (check in, duplicate check-in rejected,
  check out, history shows both times) and confirm SC-001 (single action, under 5s including
  page load). Verified live: backend flow via curl during T008-T012 (check-in → duplicate
  rejected → check-out → duplicate rejected → history correct), and the rendered page via curl
  against the real Next.js server with a signed-in session cookie — shows "Done for today" after
  both actions are complete, matching the persisted state.

**Checkpoint**: User Story 1 fully functional — check-in/check-out plus attendance history. This
is the MVP.

---

## Phase 4: User Story 2 - Employee requests leave and tracks their balance (Priority: P1)

**Goal**: An Employee can see their leave balance per type, file a request within that balance,
and see every past/pending request with its status; over-balance requests are blocked and
overlaps are flagged.

**Independent Test**: File a leave request as an Employee and confirm it appears with "pending"
status and the balance is unaffected until a decision is made (quickstart.md Scenario 2).

### Implementation for User Story 2

- [X] T016 [US2] Implement `getOrCreateLeaveBalance(orgId, employeeId, leaveTypeId, year)` in
  `apps/api/src/modules/attendance/service.ts`: if no `LeaveBalance` row exists for
  `[employeeId, leaveTypeId, year]`, create one with `allocated` from `LeaveType.defaultDays` and
  `used: 0` (FR-005, data-model.md § LeaveBalance — lazy creation, no bulk year-rollover job).
- [X] T017 [US2] Implement `createLeaveRequest(orgId, employeeId, input, actor)` in
  `apps/api/src/modules/attendance/service.ts`: validate `startDate <= endDate`; if the caller is
  not `HR`/`ADMIN`, reject a `startDate` before today with `DomainError("VALIDATION_ERROR", ...,
  400)` (spec Edge Cases — past-date requests are HR/Admin-only); compute `days` via
  `countWorkingDays` (T005); fetch/create the relevant `LeaveBalance` (T016); throw
  `DomainError("INSUFFICIENT_BALANCE", ..., 409)` if `days > allocated - used` (FR-007); else
  create the `LeaveRequest` row with `status: "PENDING"` (FR-010 — balance untouched at this
  point); compute `overlaps` via `checkOverlap` (T006) for the response only, never blocking.
  **Gap found and fixed during live verification**: the spec's Edge Case — "allowed only for
  HR/Admin to record after-the-fact leave [for someone else]" — requires HR/Admin to be able to
  file a request *on another employee's behalf*, not just bypass the past-date check for their
  own requests. The initial implementation always created the request under the caller's own
  `employeeId`, so there was no way to actually satisfy this Edge Case. Fixed by adding an
  optional `employeeId` field to `CreateLeaveRequestSchema` (HR/Admin only — a self-service
  caller setting it to anyone but themself gets 403 `FORBIDDEN`); verified live that HR can now
  create a past-dated request for `employee@hvk.in` and that the employee cannot spoof
  `employeeId` to file on someone else's behalf.
- [X] T018 [US2] Implement `getMyLeaveRequests(orgId, employeeId)` and
  `getMyLeaveBalances(orgId, employeeId, year)` in
  `apps/api/src/modules/attendance/service.ts`: the former returns all of the caller's own
  `LeaveRequest` rows newest-first (spec Acceptance Scenario 3); the latter returns one
  `LeaveBalance` row per `LeaveType` for the given year (default current year), lazily creating
  via T016 for any leave type the employee doesn't yet have a row for.
- [X] T019 [US2] Implement `apps/api/src/modules/attendance/controller.ts` `createLeaveRequest`,
  `getMyLeaveRequests`, and `getMyLeaveBalances` handlers: validate request bodies against
  `CreateLeaveRequestSchema` (T007), call the corresponding service functions, return the
  documented response shapes (contracts/attendance-leave-api.md § POST /leave-requests, GET
  /leave-requests/me, GET /leave-balances/me).
- [X] T020 [US2] Wire `POST /leave-requests`, `GET /leave-requests/me`, and
  `GET /leave-balances/me` in `routes.ts`: all three require only `authenticate` (FR-006/FR-005);
  register all three in OpenAPI.
- [X] T021 [US2] Wire `GET /leave-types` (any authenticated user) and `POST /leave-types`
  (`authorize("ADMIN", "HR")`, FR-004) in `routes.ts` → `controller.ts` →
  `repo.findLeaveTypes`/`createLeaveType`; register both in OpenAPI. 409
  `LEAVE_TYPE_EXISTS` on a duplicate `name` within the org.
- [X] T022 [US2] Implement `apps/web/components/modules/attendance/leave-balance-cards.tsx`
  (renders each leave type's `allocated`/`used`/remaining) and
  `apps/web/components/modules/attendance/leave-request-form.tsx` (`react-hook-form` +
  `zodResolver` using a client-local copy of `CreateLeaveRequestSchema`'s shape: leave-type
  dropdown, start date, end date; calls `POST /leave-requests` via `apiRequest`; shows the
  shortfall message on `INSUFFICIENT_BALANCE` and any `overlaps` returned in the response as a
  non-blocking notice before/after submission, per FR-006/research.md R2). Reused 002's
  `React.forwardRef`-wrapped `NativeSelect` pattern for the leave-type dropdown from the start,
  avoiding a repeat of that bug.
- [X] T023 [US2] Implement `apps/web/app/(app)/leave/page.tsx`: Server Component that calls
  `GET /leave-balances/me` and `GET /leave-requests/me` server-side, renders
  `LeaveBalanceCards`, `LeaveRequestForm` (T022), and a list of the employee's own requests with
  status (pending/approved/rejected). Also renders the approval queue (T030) inline for
  Manager/HR/Admin roles, per T030's own task scope.
- [X] T024 [US2] Run quickstart.md Scenario 2 end-to-end (balance view, request within balance
  leaves balance unchanged, over-balance request blocked, weekend/holiday exclusion from `days`)
  and confirm SC-002 (request filed in under 1 minute) and the FR-010/SC-003 no-decrement-on-
  submission guarantee. Verified live via curl: balance lazily created (`allocated: 20, used:
  0`), a Mon-Fri request correctly computed `days: 5`, a Mon-Sun request spanning a weekend
  correctly computed `days: 5` (not 7), balance unchanged after both submissions, and a
  29-working-day request against a 20-day balance correctly rejected with the shortfall message.

**Checkpoint**: User Stories 1 AND 2 both work independently — attendance tracking plus
self-service leave requests.

---

## Phase 5: User Story 3 - Manager (or HR/Admin) reviews and decides on leave requests (Priority: P1)

**Goal**: A Manager sees a queue of pending requests from their direct reports and can approve
or reject each; HR/Admin can do the same company-wide; self-approval is impossible; decisions
are final.

**Independent Test**: As a Manager, approve one pending request from a direct report and confirm
the requester's balance decreases and status updates to "approved"; reject another and confirm
balance is untouched (quickstart.md Scenario 3).

### Implementation for User Story 3

- [X] T025 [US3] Implement `getApprovalQueue(orgId, requester)` in
  `apps/api/src/modules/attendance/service.ts` (research.md R3/R5): for `MANAGER`, call 002's
  `getTeamView(orgId, requester)` to get current direct reports, then
  `repo.findPendingLeaveForManager` filtered to those employee ids — computed live from current
  reporting-line data, never a value cached at request-creation time (research.md R5), and never
  including the manager's own requests (research.md R3); for `HR`/`ADMIN`, call
  `repo.findPendingLeaveOrgWide` (FR-014/FR-015).
- [X] T026 [US3] Implement `decideLeaveRequest(orgId, id, decision, actor, reason?)` in
  `apps/api/src/modules/attendance/service.ts` (research.md R4, data-model.md § LeaveRequest
  state transitions): throw `DomainError("NOT_FOUND", ..., 404)` if no such request in org;
  throw `DomainError("SELF_APPROVAL_FORBIDDEN", ..., 403)` unconditionally if
  `request.employeeId === actor.employeeId` (research.md R4 — even HR/Admin); throw
  `DomainError("ALREADY_DECIDED", ..., 409)` if `status !== "PENDING"` (FR-012); for `"approve"`:
  re-compute `days` via `countWorkingDays` (T005) for a fresh count, in one transaction set
  `status: "APPROVED"`, `approverId`, `decidedAt`, increment the relevant `LeaveBalance.used` by
  `days` (FR-010), and write an `Attendance` row (`status: "ON_LEAVE"`) for each working day in
  the range (research.md R7); for `"reject"`: require a non-empty `reason` (FR-011), set
  `status: "REJECTED"`, `approverId`, `decidedAt`, `rejectionReason` — `LeaveBalance` untouched.
  Write `ActivityLog` (`action: "leave.approved"` or `"leave.rejected"`) in the same transaction
  (constitution Principle IV).
- [X] T027 [US3] Implement `apps/api/src/modules/attendance/controller.ts` `getApprovalQueue`,
  `approveLeaveRequest`, and `rejectLeaveRequest` handlers: validate the reject body against
  `RejectLeaveRequestSchema` (exists), call the corresponding service functions, return the
  documented response shapes (contracts/attendance-leave-api.md § GET /leave-requests/queue,
  POST /leave-requests/:id/approve, POST /leave-requests/:id/reject).
- [X] T028 [US3] Wire `GET /leave-requests/queue` (`authorize("MANAGER", "HR", "ADMIN")`,
  FR-014/FR-015), `POST /leave-requests/:id/approve`, and `POST /leave-requests/:id/reject`
  (both `authorize("MANAGER", "HR", "ADMIN")`, FR-009) in `routes.ts`; register all three in
  OpenAPI.
- [X] T029 [US3] Wire `GET /holidays` (any authenticated user, FR-013) and `POST /holidays`
  (`authorize("ADMIN", "HR")`, FR-013) in `routes.ts` → `controller.ts` →
  `repo.findHolidays`/`createHoliday`; register both in OpenAPI.
- [X] T030 [US3] Implement `apps/web/components/modules/attendance/approval-queue.tsx`: renders
  the caller's pending-approval queue (T025's response) with one-action Approve/Reject controls
  per request; Reject opens an inline reason field (required, FR-011) before confirming; shown
  only to Manager/HR/Admin roles on `apps/web/app/(app)/leave/page.tsx` (extends T023), gated by
  `user.role` from `AuthProvider` matching this feature's role scoping, not a hidden-but-callable
  UI element (the API's own `authorize` is the real enforcement, per constitution Principle III).
- [X] T031 [US3] Run quickstart.md Scenario 3 (approve decrements balance and writes ON_LEAVE
  attendance rows, reject leaves balance untouched, re-deciding an already-decided request is
  refused), Scenario 4 (self-approval impossible, own request excluded from own queue, routed to
  HR/Admin instead), and Scenario 5 (Manager's queue never shows outside their reporting line)
  end-to-end; confirm SC-003, SC-004, and SC-005. Verified live via curl (backend) and against
  the rendered Next.js page with a signed-in Manager session (frontend): the approval queue
  correctly showed the employee's pending request with working Approve/Reject controls; approval
  incremented the balance by exactly `days` and wrote `ON_LEAVE` attendance rows for each working
  day in the range; rejection with a reason left the balance untouched; a second decision attempt
  on an already-decided request correctly returned `ALREADY_DECIDED` (409); the manager's own
  leave request was excluded from their own queue and instead appeared in HR/Admin's; a direct
  attempt to approve their own request returned `SELF_APPROVAL_FORBIDDEN` (403).

**Checkpoint**: All three user stories independently functional — attendance tracking,
self-service leave requests, and the full approval workflow with audit trail.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that span all three stories.

- [X] T032 [P] Add Vitest unit tests for `apps/api/src/modules/attendance/service.ts` covering:
  duplicate check-in/out rejection, working-day calculation excluding weekends and holidays
  (research.md R1), insufficient-balance rejection, no-decrement-on-submission, self-approval
  rejection (unconditional, including for an HR/Admin actor), already-decided rejection,
  approval's balance-decrement and `ON_LEAVE` attendance-row side effects, and the approval
  queue's manager-scoping (mock 002's `getTeamView`/`getEmployee`).
- [X] T033 [P] Add Vitest + React Testing Library tests for
  `apps/web/components/modules/attendance/leave-request-form.tsx` covering the
  insufficient-balance error message and the overlap notice. 3 tests added in
  `leave-request-form.test.tsx`, all passing; frontend suite total now 9 tests (was 6).
- [X] T034 [P] Confirm every `/attendance/*`, `/leave-requests/*`, `/leave-types`, `/leave-
  balances/me`, and `/holidays` endpoint appears in the generated OpenAPI document and is
  browsable via Swagger UI in dev (constitution Development Workflow § API documentation),
  matching 001/002's verification approach. Verified via `GET /openapi.json`: all 11
  attendance-module paths present (`/attendance/check-in`, `/attendance/check-out`,
  `/attendance/me`, `/leave-requests`, `/leave-requests/me`, `/leave-requests/queue`,
  `/leave-requests/{id}/approve`, `/leave-requests/{id}/reject`, `/leave-balances/me`,
  `/leave-types`, `/holidays`) alongside 001's 5 and 002's 7 — 23 total.
- [X] T035 Run the full quickstart.md checklist end-to-end (all 5 scenarios, all 5 success
  criteria) as final acceptance validation against a live, migrated, seeded database. All 5
  scenarios verified against the real running system: the API directly (curl) for business
  logic, and the actual Next.js server-rendered pages (curl against `localhost:3000` with real
  signed-in session cookies) for the UI layer — the check-in/out card's state, the leave
  balance/request/history sections, and the Manager's approval queue with a real pending request
  and working Approve/Reject controls were all confirmed in the rendered HTML. SC-001/SC-002's
  precise wall-clock timings are the one aspect that genuinely needs a human clicking through the
  UI with a stopwatch — everything else (SC-003, SC-004, SC-005) is fully confirmed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only. This is the MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational; independent of US1's files (attendance
  check-in/out vs. leave requests/balances) though both live in the same `service.ts`/
  `routes.ts` — sequence within the file, not a hard story dependency.
- **User Story 3 (Phase 5)**: Depends on Foundational and on US2's `LeaveRequest`/
  `LeaveBalance` logic existing (T016-T017) since approval acts on requests US2 creates; T030's
  UI depends on US2's T023 page shell existing first.
- **Polish (Phase 6)**: Depends on all three stories being complete.

### Within Each User Story

- Repository (Phase 2, shared) → Service → Controller → Routes (each depends on the previous
  within the same story).
- Backend endpoint before the frontend page/component that calls it.

### Parallel Opportunities

- T002/T003 (Setup) in parallel.
- T006/T007 (Foundational — different files) in parallel once T004/T005 land.
- Within US2: T016 and T006 (Foundational) can proceed in parallel with T008-T015 (US1) once
  Phase 2 completes, since attendance and leave-balance logic touch different concerns within
  the same files.
- T032/T033/T034 (Polish) in parallel.

---

## Parallel Example: Foundational Phase

```bash
# After T004-T005 (repository, working-day calc) complete, these can run together:
Task: "Implement checkOverlap in apps/api/src/modules/attendance/service.ts"
Task: "Extend apps/api/src/modules/attendance/schema.ts with new response schemas"
```

## Parallel Example: User Story 1

```bash
Task: "Implement checkIn/checkOut in apps/api/src/modules/attendance/service.ts"
# then, once the response shape is confirmed:
Task: "Implement CheckInOutCard.tsx (apps/web)"
# in parallel with:
Task: "Implement getAttendanceHistory + GET /attendance/me wiring"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (repository, working-day calculation, overlap detection) —
   CRITICAL, blocks everything else.
3. Complete Phase 3: User Story 1 (check-in/check-out + history).
4. **STOP and VALIDATE**: run quickstart.md Scenario 1, confirm SC-001.
5. Demo: an employee can check in/out and see their attendance history. Leave requests (US2) and
   approvals (US3) still needed before this is production-ready, but daily attendance tracking
   is demoable here.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. User Story 1 → validate → demo (MVP).
3. User Story 2 next (leave requests + balances) → validate → demo.
4. User Story 3 (approval workflow) → validate → demo — this is what makes leave functionally
   complete per spec's own "Why this priority" note.
5. Polish.

### Parallel Team Strategy

With multiple developers, after Foundational completes:
- Developer A: User Story 1 (check-in/out flow, both apps).
- Developer B: User Story 2's leave request/balance logic (T016-T024) — independent of US1's
  files once the schema (T007) exists.
- Developer C: waits for US2's T017 (createLeaveRequest) to exist before starting User Story 3's
  approval logic, since approval acts on requests US2 creates.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- US1, US2, and US3 are all P1 — spec.md treats check-in/out, leave requests, and the approval
  workflow as equally critical; per spec's own note, "leave" isn't functionally complete without
  US3's approval step, so don't treat US1/US2 as "done" for production readiness until US3 also
  lands, even though each is independently demoable.
- Every task that touches `Attendance`/`LeaveType`/`LeaveBalance`/`LeaveRequest`/`Holiday` reads
  existing field definitions from data-model.md rather than inventing new ones — no migration
  task exists in this list because none is needed (plan.md Storage).
- This feature reuses 001-auth-rbac's `authenticate`/`authorize` middleware and
  002-employee-management's exported `getEmployee`/`getTeamView` functions as-is — no changes to
  either module anticipated by any task here.
- Commit after each task or logical group.
- Stop at any checkpoint to validate a story independently via quickstart.md.

**Post-implementation fix 2026-10-20**: `POST /leave-requests/:id/approve|reject` checked
self-approval and status but not the reporting line, so a Manager could decide a request from
outside their team by id (FR-014 only scoped the queue). `decideLeaveRequest` now requires a
Manager's caller to be the requester's current manager (live `getTeamView`, research.md R5) and
returns 403 `FORBIDDEN` otherwise; HR/Admin still decide org-wide (FR-015). Found by
001's end-to-end run (`scripts/e2e-001-auth.mjs`); unit tests added in `service.test.ts`.
