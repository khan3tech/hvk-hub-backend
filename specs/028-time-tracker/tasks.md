# Tasks: Time Tracker

**Input**: plan.md, research.md, data-model.md, contracts/time-tracker-api.md. Backend only (frontend repo owns the UI).

## Phase 1: Setup
- [X] T001 Prisma models `TimeProject`, `TimeProjectMember`, `TimeTask`, `TimeEntry`, `RunningTimer`, `Timesheet` + Employee back-relations; migration `time_tracker`
- [X] T002 Notification types `TIMESHEET_SUBMITTED`, `TIMESHEET_DECIDED` in `notifications/schema.ts`
- [X] T003 `timetracking/week.ts`: org-local date, `weekStart`, week range, minutes between (R1/R2/R5)

## Phase 2: US2: Projects & tasks (P1)
- [X] T004 schema/repository/service: create/list/get/update project (code unique, scoping, `canManage`)
- [X] T005 Tasks add/rename/archive; members add/remove (active employees only)

## Phase 3: US1: Manual entries (P1)
- [X] T006 Create/update/delete/list entries: membership, archived, daily limit, week lock, scoping

## Phase 4: US3: Timer (P1)
- [X] T007 Start (unique, switch), get, note, stop → entry (flagging), discard

## Phase 5: US4: Timesheets (P1)
- [X] T008 Week view (lazy timesheet, `can*` flags), submit (EMPTY_WEEK, TIMER_RUNNING)
- [X] T009 Approve / reject / reopen: approver rule, conditional transitions, audit, notifications

## Phase 6: US5/US6: Team & reports (P2)
- [X] T010 Team week rows (manager direct reports / HR all)
- [X] T011 Hours report grouped by project/employee/task, billable split, approvedOnly, scoping

## Phase 7: Wiring & polish
- [X] T012 controller + routes + OpenAPI; mount `/api/time` in `app.ts`
- [ ] T013 (deferred: tests postponed by the user) Unit tests `week.test.ts`, `service.test.ts`
- [ ] T014 (deferred: tests postponed by the user; verified manually with a 52-check run of quickstart.md) `scripts/e2e/028-time-tracker.mjs` + add to `run-all.mjs`
