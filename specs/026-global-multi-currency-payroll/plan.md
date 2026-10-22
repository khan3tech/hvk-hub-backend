# Implementation Plan: Global / Multi-Currency Payroll

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

Extends 004 payroll and 010 statutory with:

- effective-dated payroll country/currency assignments per employee;
- optional org home defaults;
- country-scoped statutory components;
- one payroll run across countries, with a per-country summary;
- exchange rates recorded per period and a reporting-currency total.

Single-country organizations keep working with zero new configuration. Backend only.

## Technical Context

- **Migration `global_payroll`**:
  - new `PayrollAssignment` (employee, country, currency, effectiveFrom);
  - `PayrollCurrencySettings` (defaultCountry, defaultCurrency, reportingCurrency — all
    optional) replaces the never-used `ReportingCurrencyConfig`;
  - the unused `Employee.payrollCountry/payrollCurrency` columns are dropped in favour of the
    dated assignments;
  - Payslip gains `country`;
  - ExchangeRate gains `recordedById` and `updatedAt`.
- **Code**:
  - `payroll/global.ts` (service) and `payroll/globalRoutes.ts` (mounted under `/api/payroll`);
  - `payroll.resolveContext` used by salary structures and payroll runs;
  - new hook `setStatutoryCoverage`;
  - the StatutoryCalculator input gains `country` and `homeCountry`.

## Research & decisions

- **R1 — Modes (FR-002 vs FR-011)**:
  - **Single-country** (no home country set and no assignments): everything behaves as before.
    Payslips use `defaultCurrency` or the legacy `INR`, with `country = null`, and every
    statutory component applies.
  - **Multi-country**: turns on when the org sets a home country or assigns any employee. An
    employee resolves to their assignment effective at period end, else the home defaults. With
    neither, they are skipped with `NO_PAYROLL_COUNTRY`; nothing is silently assumed.
- **R2 — Effective dating (US1.3, FR-007)**: an assignment applies from `effectiveFrom`, using
  the same "latest on or before" rule as salary structures. Payslips store `currency` and
  `country` at generation, so later transfers never touch them.
- **R3 — Currency safety (FR-004)**:
  - A salary structure takes the employee's currency on its effective date.
  - If the structure in effect has a different currency than the employee's current context (a
    transfer without a new salary), the employee is skipped with `CURRENCY_MISMATCH` rather
    than relabelling amounts.
  - A structure saved before any currency was known (null) is read as being in the employee's
    currency.
- **R4 — Statutory scoping (FR-003/006, SC-003)**:
  - A component with a `country` applies only to that country.
  - An untagged component belongs to the home country, or to everyone in single-country mode.
  - In multi-country mode, an employee whose country has no component in effect is skipped with
    `NO_STATUTORY_COMPONENTS_FOR_COUNTRY`.
  - Country codes are upper-cased.
- **R5 — Run summary (US2.2)**: `byCountry[{country, currency, payslipCount, netPay}]`;
  currencies are never summed together.
- **R6 — Reporting (FR-008–010, SC-004)**:
  - Rates are recorded per period as 1 `fromCurrency` = `rate` reporting currency; recording
    again replaces the rate.
  - The total is derived on read from the period's current payslips, so it reflects re-runs and
    corrected rates without changing any payslip.
  - Any currency without a rate → `complete: false`, `missingRates`, and a null total.
  - No reporting currency set → 409 `REPORTING_CURRENCY_NOT_SET`.
- **R7 — Codes**: currencies are validated against `Intl.supportedValuesOf("currency")` (ISO
  4217); countries must be ISO 3166 alpha-2 format. Rates are entered manually; there is no
  live fetching.

## Constitution Check

I PASS (statutory plugs in via hooks; global.ts stays in payroll) · II PASS · III PASS · IV PASS
(ActivityLog for settings, assignments, rates) · VI PASS · VII PASS (manual rates, no
disbursement).
