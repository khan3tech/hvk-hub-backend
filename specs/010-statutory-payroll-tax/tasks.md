# Tasks: Statutory Payroll Tax & Compliance

**Input**: plan.md, contracts/statutory-api.md, quickstart.md. Backend only.

## Phase 1: Setup
- [X] T001 Migration `statutory_payroll_tax` (versions via groupId, exemption groupId, Payslip.statutoryDeductions)
- [X] T002 Payroll `setStatutoryCalculator` hook; payslips store lines, netPay subtracts them; PayslipSchema field

## Phase 2: US1 — Configure (P1)
- [X] T003 Rule schemas (FLAT/PERCENTAGE/BRACKET) with per-type validation
- [X] T004 Components + effective-dated versions + discontinue; list current/history (FR-001/002)
- [X] T005 Exemptions create/list/delete (FR-003); router Admin/HR only (FR-009)

## Phase 3: US2 — Apply in payroll (P1)
- [X] T006 Pure calculator (`calculate.ts`) incl. progressive brackets and proration (FR-010)
- [X] T007 `calculateStatutory` registered in app.ts: version in effect at period end, exemptions applied (FR-004/005/008)

## Phase 4: US3 — Compliance report (P2)
- [X] T008 Generate from current payslips, stored per generation; list/get (FR-006)
- [X] T009 CSV export with formula-injection guard (FR-007)

## Phase 5: Polish
- [X] T010 Unit tests: statutory (9) + payroll statutory integration (1)
- [X] T011 `scripts/e2e/010-statutory.mjs` (17 checks, hand-calculated amounts)
