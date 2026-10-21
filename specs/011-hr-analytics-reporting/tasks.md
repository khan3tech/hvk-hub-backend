# Tasks: HR Analytics & Reporting

**Input**: plan.md, contracts/analytics-api.md, quickstart.md. Backend only, no migration.

## Phase 1: Setup
- [X] T001 Bulk reads: employee `listEmployeesForAnalytics`, attendance `listApprovedLeaveForAnalytics`, payroll `getPayrollCostByPeriod`
- [X] T002 Pure `compute.ts` (employed-on, breakdown with Unassigned, trend, attrition, tenure, CSV)

## Phase 2: US1 — Headcount (P1)
- [X] T003 `/headcount`: total + department/designation + month-end trend (FR-001/002/008)

## Phase 3: US2 — Attrition & tenure (P1)
- [X] T004 `/attrition`: count, rate, by department, average tenure (FR-003/004)

## Phase 4: US3 — Leave & payroll cost (P2)
- [X] T005 `/leave-usage` with department filter (FR-005); `/payroll-cost` per period (FR-006/007)

## Phase 5: Polish
- [X] T006 Admin/HR-only router (FR-009); `?format=csv` on all (FR-010); thin-history note
- [X] T007 Unit tests (9, manual-calculation checks); `scripts/e2e/011-analytics.mjs` (11 checks)
