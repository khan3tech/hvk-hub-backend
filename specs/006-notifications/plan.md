# Implementation Plan: Notifications (email + in-app)

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

A `notifications` module owns the existing `Notification` table and exposes
`notifyEmployees()`, `notifyRoles()` and `notifyDepartmentManagers()`. Leave (003), payroll (004)
and recruitment (005) call them at the five events in FR-001–FR-005. Users get a self-scoped
notification center under `/api/notifications` with an unread count and mark-read (FR-006/007).
Backend only.

## Technical Context

TypeScript/Express/Prisma/zod; no new dependencies, no migration (the `Notification` model
already existed). Email goes through `src/lib/email.ts`, a small `EmailSender` interface whose
default `LogEmailSender` only logs recipient and subject. A real SMTP/SES sender can be plugged in
with `setEmailSender()` once a provider is chosen.

## Research & decisions

- **R1 — In-app first, always**: the `Notification` row is written before any email attempt; an
  email failure is caught and logged (FR-008, SC-002). Notification failures never fail the
  triggering action: every `notify*` call swallows and logs its own errors.
- **R2 — Email adapter**: provider-agnostic interface; the log sender is the default because no
  provider credentials exist in this repo. Bodies are never logged (they can carry leave reasons
  and payroll detail).
- **R3 — Offboarded**: before emailing, the recipient's employee status is checked; OFFBOARDED
  means in-app only (FR-009, SC-004).
- **R4 — Routing**: other modules hold Employee ids, so recipients resolve through
  `auth/service.findUserForEmployee` / `listUsersByRole` and `employee/service.getEmployeeSummary`.
  No cross-module Prisma reads (Principle I). Employees without a login are skipped.
- **R5 — Batching**: payroll sends one summary to the HR/Admin who ran it, naming skipped
  employees and reasons, never one notification per payslip (Assumptions).
- **R6 — Links**: app-relative paths (`/leave/requests/:id`, `/payroll/runs/YYYY-MM`,
  `/recruitment/applications/:id`) the frontend routes to the record (FR-010).

## Event map

| FR | Trigger (module) | Recipients | Channels |
|---|---|---|---|
| 001 | leave approved/rejected (003) | requester | in-app + email |
| 002 | leave filed (003) | requester's manager | in-app |
| 003 | payroll run done (004) | HR/Admin who ran it | in-app + email |
| 004 | interview scheduled/reassigned (005) | interviewer | in-app + email |
| 005 | interview result recorded (005) | HR + Admin + department Managers | in-app |

## Constitution Check

I (module boundaries via service calls) PASS · II (local zod) PASS · III (self-scoped center;
markRead filters by userId) PASS · IV (source actions keep their own ActivityLog) PASS · VI
(orgId on every query) PASS · VII (no queue/worker; synchronous fan-out is enough at this volume)
PASS.
