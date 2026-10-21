# Implementation Plan: Performance Management

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New `performance` module (`/api/performance`):

- **Goals**: proposed, approved (or changes requested), then progress-tracked.
- **Review cycles**: opened by HR, creating one review per covered employee.
- **Reviews**: a manager draft, employee self-reflection, finalization (locked afterwards), and
  HR-only corrections.

Backend only.

## Technical Context

Existing `Goal`, `ReviewCycle`, `Review`. Migration `performance_management` adds:

- Goal `progressPercent`, `changeRequestNote`, `approvedById`, `approvedAt`, `updatedAt`;
- ReviewCycle `createdById`, `createdAt`;
- Review `previousManagerId`, `managerChangedAt`, `correctedAt`, `createdAt`.

## Research & decisions

- **R1 — Goal lifecycle**: PENDING_APPROVAL → ACTIVE (approve) or CHANGES_REQUESTED (with a
  note). The owner revises back to PENDING_APPROVAL, and ACTIVE becomes COMPLETED when the owner
  marks it done. Transitions are conditional updates. Only the employee's *current* manager (or
  HR/Admin) decides, never the owner. Progress updates are allowed until the target date
  (FR-004).
- **R2 — Rating**: a fixed 1–5 scale with labels (Assumptions). Finalizing requires a rating.
  Goals are optional (edge case).
- **R3 — Cycle membership (FR-008)**: an explicit `employeeIds` list, or a department, or the
  whole company, fixed when the cycle opens. Employees with no manager are reviewed by the HR or
  Admin user who opened the cycle.
- **R4 — Reviewer follows the reporting line (FR-011, SC-005)**: whenever an in-progress review
  is read or listed, if the employee's current manager differs, the review moves to them and
  records `previousManagerId`/`managerChangedAt` plus an audit row. `/reviews/to-do` includes
  direct reports' reviews so a transferred review appears immediately.
- **R5 — Lock (FR-007, SC-004)**: draft and self-reflection writes are conditional on
  IN_PROGRESS. A FINAL review returns 409 `REVIEW_FINAL`. HR/Admin `corrections` require a reason
  and record before/after in ActivityLog plus `correctedAt`.
- **R6 — Cycle status (FR-009/010)**: completed, pending, overdue (in progress and past the end
  date), and `notRequired` for offboarded employees' unfinished reviews (edge case).
- **R7 — Visibility**: goals and history are visible to the employee, their current manager and
  HR/Admin. A review is visible to the employee, its current reviewer and HR/Admin.

## Constitution Check

I PASS (reporting line via 002's service) · II PASS · III PASS · IV PASS (ActivityLog for
goals, transfers, finalization, corrections) · VI PASS · VII PASS (no 360 feedback, fixed scale).
