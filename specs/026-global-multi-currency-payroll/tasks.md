# Tasks: Global / Multi-Currency Payroll

**Input**: plan.md, contracts/global-payroll-api.md, quickstart.md. Backend only.

- [X] T001 Migration `global_payroll` (PayrollAssignment, PayrollCurrencySettings, Payslip.country, ExchangeRate audit fields)
- [X] T002 US1: settings and effective-dated assignments with ISO validation; salary structures in the employee's currency (FR-001, FR-004)
- [X] T003 Context resolution: single-country unchanged, multi-country never assumes (FR-002, FR-011)
- [X] T004 US2: per-country statutory scoping + coverage skip; currency-mismatch skip; per-country run summary (FR-003, FR-005, FR-006)
- [X] T005 Payslips keep their currency/country (FR-007)
- [X] T006 US3: exchange rates per period; reporting total with missing-rate reporting (FR-008–010)
- [X] T007 Unit tests (7 + 2 statutory); `scripts/e2e/026-global-payroll.mjs` (16 checks); 010/011/021/025 e2e re-run
