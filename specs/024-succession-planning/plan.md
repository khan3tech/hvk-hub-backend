# Implementation Plan: Succession Planning

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New `succession` module (`/api/succession`, HR/Admin only) covering:

- marking positions critical;
- successors with readiness levels and a history of readiness changes;
- automatic invalidation when a successor leaves;
- a risk-grouped overview with a department filter and multi-position successors.

The critical flag also appears on employee profiles and the org chart, for HR/Admin only.
Backend only.

## Technical Context

- **Migration `succession_planning`**:
  - SuccessionPlan gains `isCritical`, `markedById`, `markedAt`, `unmarkedAt`;
  - SuccessionCandidate gains `createdAt`, `addedById`, `invalidReason`, `invalidatedAt`, and is
    unique per plan+employee;
  - new `SuccessionReadinessChange`.
- **New hooks**:
  - `employee.onEmployeeOffboarded` runs after offboarding, with failures logged;
  - the employee decorators now receive the requester, so a decorator can restrict fields by role;
  - `orgchart.setCriticalPositionsProvider` feeds the HR-only org chart overlay.

## Research & decisions

- **R1 — Position = employee (FR-001)**: a plan is keyed by the holder's employee id, matching
  the existing schema.
  - Unmarking sets `isCritical=false` and keeps the plan; marking again reuses it, with its
    history.
  - Only active employees can be marked.
- **R2 — Successors (FR-002/003)**:
  - Successors must be active employees in the org, and the holder can't be their own successor.
  - An employee appears at most once per plan. Re-adding someone who was removed reinstates their
    entry, so their history continues.
  - Removing a successor marks the entry not valid ("Removed by HR") instead of deleting it.
- **R3 — History (FR-004)**: every level, from the initial one onward, is a
  SuccessionReadinessChange row with from, to, note, actor and time.
- **R4 — Offboarding (FR-005, SC-003)**: one `updateMany` invalidates every valid candidacy of
  the leaver with the reason "Offboarded"; the rows are kept. A vacant critical position (the
  holder offboarded) stays on the overview flagged `vacant` (FR-006).
- **R5 — Risk (FR-007)**: computed over valid successors only:
  - NO_COVERAGE: none;
  - NOT_READY: some, none ready now;
  - READY_NOW: at least one ready now.

  The overview returns totals, groups ordered by risk, a `departmentId` filter (FR-008), and
  `multiPositionSuccessors` computed across all critical plans (FR-009).
- **R6 — Visibility (FR-010, SC-004)**: the router is HR/Admin only. The profile
  `criticalPosition` flag and the org chart overlay are added only for HR/Admin requesters.
  Successors are never notified.

## Constitution Check

I PASS (hooks for offboarding, profile decoration and the org chart; no cross-module repo
access) · II PASS · III PASS · IV PASS (ActivityLog for mark/unmark/add/readiness/remove;
readiness history rows) · VI PASS · VII PASS (manual readiness).
