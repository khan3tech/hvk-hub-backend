# Tasks: Asset & Expense Management

**Input**: plan.md, contracts/assets-expenses-api.md, quickstart.md. Backend only.

## Phase 1: Setup
- [X] T001 Migrations `asset_expense` + `asset_task_keys_backfill`; upload middleware shared
- [X] T002 `systemKey` on built-in onboarding/exit tasks; `completeSystemTask` in both; exit task guards

## Phase 2: US1 — Inventory (P1)
- [X] T003 Create (unique identifier), list, detail with history (FR-001)
- [X] T004 Conflict-safe assign; return; lost/damaged (FR-002/003, SC-004); profile `assignedAssets` (FR-004)

## Phase 3: US2 — Onboarding & exit (P1)
- [X] T005 Assign completes ASSET_ASSIGNMENT (FR-005); last release completes ASSET_RETURN (FR-006)
- [X] T006 ASSET_RETURN guard blocks manual completion → offboarding blocked (US2.3)

## Phase 4: US3 — Expenses (P2)
- [X] T007 Categories with receipt rule (FR-008); multipart claims with receipts (FR-007)
- [X] T008 Live-manager queue and decisions, rejection reason (FR-009/010); paid + payouts (FR-011, SC-005)

## Phase 5: Polish
- [X] T009 Unit tests (8 assets + 8 expenses); `scripts/e2e/014-assets-expenses.mjs` (25 checks)
