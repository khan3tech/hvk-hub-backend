# Implementation Plan: Resignation & Exit Management

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New `exit` module (`/api/exit`): employees resign, and their Manager or HR acknowledges, which
starts the notice period and creates an IT/Finance/HR exit checklist. HR clears the tasks and
offboards through 002, which revokes access. Withdrawals, forced exits, exit-interview notes and a
"last day passed" prompt are included. Backend only.

## Technical Context

Existing `Resignation`, `ExitChecklist`, `ExitTask`. Migration `resignation_exit` adds Resignation
`reason/acknowledgedById/acknowledgedAt/withdrawnAt/completedAt/forcedOffboard/exitDuePromptedAt`
and ExitChecklist `reportsToReassign (Json)/closedAt`. New `lib/scheduler.ts` (in-process interval
jobs, started from `server.ts` only).

## Research & decisions

- **R1 — "Serving notice" is not an EmployeeStatus**: every module treats `ACTIVE` as "works
  here". Someone serving notice still does, so `EmployeeStatus` stays ACTIVE/OFFBOARDED. The
  resignation carries the state, and employee get/list responses gain `exitStatus`
  (`RESIGNATION_PENDING | SERVING_NOTICE | null`) and `lastWorkingDay` through
  `registerEmployeeDecorator("exit", …)` (FR-004). A withdrawal leaves no trace (SC-005). 007's
  status provider was generalized into the same decorator mechanism.
- **R2 — One active resignation**: checked on submit (FR-002). Every state change is a
  conditional `updateMany WHERE status IN (...)`, so double acknowledge/withdraw/complete returns
  409 `INVALID_STATE`.
- **R3 — Task owners**: IT, Finance and HR teams have no login roles of their own, so HR/Admin
  complete clearance tasks on their behalf, with attribution and timestamps.
- **R4 — Offboarding**: blocked with 409 `EXIT_CLEARANCE_INCOMPLETE` and `fields.remainingTasks`
  unless `force: true` (FR-006). It calls `employee.offboardEmployee`, which sets OFFBOARDED and
  revokes all sessions (FR-010, SC-004). Forced exits record `forcedOffboard` and leave open
  tasks visible.
- **R5 — Reassignment flag (FR-009)**: the resigning employee's active direct reports are
  snapshotted into `reportsToReassign`, plus an HR task "Reassign N direct report(s)".
- **R6 — Exit-due prompt (US2.3)**: an hourly job notifies HR once per serving-notice
  resignation whose confirmed last day has passed (`exitDuePromptedAt` makes it idempotent).
- **R7 — Privacy**: exit-interview notes are stripped from responses for anyone except HR/Admin
  (FR-007). Resignations are never deleted (FR-011).

## Constitution Check

I PASS (employee offboarding and reports via 002's service; decorator registration instead of
imports) · II PASS · III PASS · IV PASS (ActivityLog on every transition) · VI PASS · VII PASS
(interval timer, no queue; notice-period length set by HR per resignation).
