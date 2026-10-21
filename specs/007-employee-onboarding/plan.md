# Implementation Plan: Employee Onboarding

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New `onboarding` module (`/api/onboarding`). Every new employee gets a checklist copied from the
org's editable standard template. Tasks are owned by role or by a specific reassigned employee
and completed by their owner with attribution. HR gets an in-progress overview with stalled
flags, and directory/profile responses carry `onboardingStatus`. Backend only.

## Technical Context

Existing models `OnboardingTaskTemplate`, `OnboardingChecklist` (one per employee) and
`OnboardingTask`. Migration `employee_onboarding` adds `OnboardingTask.ownerEmployeeId`
(reassignment, FR-006), `position` (stable order) and `createdAt`. No new dependencies.

## Research & decisions

- **R1 — Default template**: seeded lazily per org on first use (5 tasks covering the EMPLOYEE,
  IT, MANAGER and HR owner roles). HR/Admin edit it via `/templates`. Checklists *copy* template
  rows, so edits never change existing checklists (FR-010).
- **R2 — Auto-attach without a cycle**: `employee/service` exposes `onEmployeeCreated(hook)` and
  `setOnboardingStatusProvider(fn)`, registered in `app.ts`. Employee never imports onboarding.
  A failing hook is logged and the employee still saves; HR can attach manually (FR-005).
- **R3 — Ownership**: HR/Admin can always complete. Without them, an explicit
  `ownerEmployeeId` wins; otherwise EMPLOYEE means the hire and MANAGER means the hire's
  *current* manager (live from 002). IT has no login role, so IT tasks route to Admin (FR-003
  "IT/Admin"). The default owner is HR.
- **R4 — Completion**: conditional update `WHERE status = INCOMPLETE` records `completedById` and
  `completedAt`; a second completion is a 409 (SC-003).
- **R5 — Overview**: active employees with an incomplete checklist; stalled = today is after the
  joining date and the checklist is still incomplete (FR-009). Complete checklists drop out
  immediately (SC-004).
- **R6 — Visibility**: HR/Admin, the hire, their manager, or a reassigned owner can read a
  checklist (SC-002); `/tasks/me` lists the tasks routed to the caller.

## Constitution Check

I PASS (extension points instead of cross-module imports) · II PASS · III PASS (role gates on
routes, ownership in service) · IV PASS (ActivityLog for checklist/task changes) · VI PASS ·
VII PASS (one template, no per-type templates).
