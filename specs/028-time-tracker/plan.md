# Implementation Plan: Time Tracker (Projects, Timesheets, Live Timer)

**Branch**: `028-time-tracker` | **Date**: 2026-11-21 | **Spec**: [spec.md](./spec.md)

## Summary

New `timetracking` module (`/api/time`) covering:

- projects with tasks and members, owned by HR/Admin or the Manager who created them;
- manual time entries on tasks, in whole minutes;
- one server-side running timer per employee (start / stop → entry / discard / switch), flagged when overnight or over 12 hours;
- weekly Monday–Sunday timesheets: DRAFT → SUBMITTED → APPROVED | REJECTED, plus an HR reopen, with locking, audit and notifications;
- a team week view and an hours report grouped by project, employee or task.

Backend only; the frontend repo builds the UI against [contracts/time-tracker-api.md](./contracts/time-tracker-api.md).

## Technical Context

- **Stack**: as every module: Express + zod + Prisma/Postgres, `routes → controller → service → repository`, OpenAPI through `documentRoute`.
- **New tables** (migration `time_tracker`): `TimeProject`, `TimeProjectMember`, `TimeTask`, `TimeEntry`, `RunningTimer`, `Timesheet`. See [data-model.md](./data-model.md).
- **Reuses**:
  - `employee/service` (`getEmployeeSummary`, `listDirectReportIds`, `listActiveEmployeeSummaries`) for membership checks, manager scope and team lists;
  - `notifications/service` (`notifyEmployees`, `notifyRoles`), with new types `TIMESHEET_SUBMITTED` and `TIMESHEET_DECIDED`;
  - the `ActivityLog` table for audit.
- **Time zone**: no per-org time zone setting exists yet, so the module uses one constant, `ORG_TIME_ZONE = "Asia/Kolkata"` (see research R1).
- **Testing**: vitest unit tests for the pure rules (week math, locking, flagging, scoping), plus `scripts/e2e/028-time-tracker.mjs` against a running API.

## Constitution Check

- I **PASS**: one module; other modules are reached only through their services.
- II **PASS**: zod schemas in `schema.ts`; the frontend keeps its own copies.
- III **PASS**: roles are declared on routes and enforced in the service (direct-report and ownership checks).
- IV **PASS**: timesheet transitions are conditional updates, and every decision writes an `ActivityLog` row.
- VI **PASS**: tenant-scoped by `orgId`, like every other module.
- VII **PASS**: no billing or invoicing, no multi-level approvals.

Re-checked after design: still PASS.

## Research & decisions

See [research.md](./research.md). In short:

- R1: dates use the org time zone constant.
- R2: weeks are keyed by `weekStart`, the Monday of the week.
- R3: entries carry a denormalized `projectId` and `weekStart`.
- R4: the timer is a single row per employee, with a unique constraint.
- R5: flagging rules.
- R6: locking is checked against the timesheet of the target week.
- R7: an approver is the reporting manager or HR/Admin, never yourself.
- R8: reports aggregate in SQL with `groupBy`.

## Project Structure

```text
src/modules/timetracking/
  schema.ts        zod request/response schemas
  repository.ts    Prisma access (only this module's tables)
  service.ts       business rules (RBAC, locking, timer, timesheets, reports)
  week.ts          pure date helpers (org-local date, weekStart, minutes between)
  controller.ts
  routes.ts        router + documentRoute()
  service.test.ts / week.test.ts
prisma/migrations/<ts>_time_tracker/migration.sql
scripts/e2e/028-time-tracker.mjs
```

Mounted in `src/app.ts` as `app.use("/api/time", timeRouter)`.
