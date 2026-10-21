# Implementation Plan: Asset & Expense Management

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

Two new modules, both backend only:

- **`assets`** (`/api/assets`): inventory with conflict-safe assignment, plus return and
  lost/damaged. It is wired into 007's onboarding and 009's exit checklists.
- **`expenses`** (`/api/expenses`): configurable categories with receipt rules, claims with
  receipts, manager approval by the live reporting line, rejection reasons, and payout tracking.

## Technical Context

- **Migration `asset_expense`**:
  - OnboardingTaskTemplate/OnboardingTask/ExitTask: `systemKey`;
  - Asset: `createdAt`;
  - AssetAssignment: `assignedById`, `closedById`, `outcome`;
  - ExpenseClaim: `description`, `receiptName`, `receiptContentType`, `decidedAt`, `paidById`;
  - new `ExpenseCategory` model.
- **Migration `asset_task_keys_backfill`**: tags previously created built-in asset tasks.
- **Shared upload checks**: 008's upload middleware moved to `src/middleware/upload.ts`.

## Research & decisions

- **R1 — No double assignment (SC-004)**: assign is a transaction containing a conditional
  `UPDATE Asset SET status=ASSIGNED WHERE status=UNASSIGNED` plus the assignment row. A lost
  race returns 409 `ASSET_UNAVAILABLE`. Return, lost and damaged close the open assignment with
  an `outcome`.
- **R2 — Checklist integration (FR-005/006)**: built-in tasks carry a stable `systemKey`:
  `ASSET_ASSIGNMENT` on the onboarding IT task and `ASSET_RETURN` on the exit IT task. Assigning
  calls `onboarding.completeSystemTask`; releasing an employee's last asset calls
  `exit.completeSystemTask`. Both are no-ops when there's no matching open task, so free
  reassignment still works (edge case). Assets imports onboarding and exit (one direction only).
- **R3 — Offboarding block (US2.3)**: `exit.registerExitTaskGuard("ASSET_RETURN", …)` stops HR
  ticking the task by hand while assets are still assigned (409 `TASK_BLOCKED`). An incomplete
  task then blocks offboarding through 009's existing rule.
- **R4 — Categories (FR-008)**: seeded per org on first use (Travel, Meals, Equipment and Other
  require a receipt; Internet & phone doesn't), and editable by HR. Lookups are
  case-insensitive, and inactive categories can't be used.
- **R5 — Receipts**: same size and type checks as 008, stored through `lib/storage.ts`. The
  storage key is never returned (`hasReceipt` instead). Downloads follow claim visibility:
  claimant, current manager or HR/Admin.
- **R6 — Routing (FR-009)**: a Manager's queue holds pending claims of *current* direct reports,
  so pending claims follow a manager change (edge case). The claimant can't decide their own
  claim. Decisions and payment are conditional transitions (409 on a double decision).
- **R7 — Profile (FR-004)**: an `assets` employee decorator adds `assignedAssets`.

## Constitution Check

I PASS (assets→onboarding/exit via exported services; exit guard via registration) · II PASS ·
III PASS · IV PASS (ActivityLog for all asset and claim actions) · VI PASS · VII PASS (no
depreciation, no multi-level approvals, "paid" is a status).
