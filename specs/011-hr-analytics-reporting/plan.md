# Implementation Plan: HR Analytics & Reporting

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New read-only `analytics` module (`/api/analytics`, Admin/HR only) with four dashboards:
headcount, attrition plus tenure, leave usage and payroll cost. Each aggregates existing
employee, leave and payslip records and can be exported as CSV. No new tables and no migration.
Backend only.

## Technical Context

Bulk read helpers were added to the source modules, so analytics never touches their tables
(Principle I):

- `employee.listEmployeesForAnalytics` (offboard dates come from the `employee.offboarded` audit
  rows 002 already writes);
- `attendance.listApprovedLeaveForAnalytics`;
- `payroll.getPayrollCostByPeriod`.

All math lives in `analytics/compute.ts` as pure functions.

## Research & decisions

- **R1 — Employed on a date**: joined on or before it and not yet offboarded. Offboarded staff
  still count for the months they worked (US1.3). An offboarded record without an audit date
  counts as gone. The current total and the breakdowns use the same rule, so they always add up.
- **R2 — Trend (FR-002)**: month-end headcount plus joins and exits per month across the range
  (default: the last 12 months).
- **R3 — Attrition (FR-003)**: exits in the range ÷ average of the opening (day before `from`)
  and closing (`to`) headcount, as a percentage to 2 decimals, overall and per department.
- **R4 — Tenure (FR-004)**: mean days since joining across active employees who have joined,
  also given in years (÷ 365.25).
- **R5 — Leave usage (FR-005)**: approved requests attributed to the range they *start* in, with
  their recorded working-day count, per leave type and optionally per department.
- **R6 — Payroll cost (FR-006/007)**: summed from current payslips per period (gross, statutory,
  net). Re-runs replace payslips, so totals are always the corrected ones.
- **R7 — Unassigned (FR-008)**: a null department or designation becomes an explicit
  `unassigned` / "Unassigned" bucket.
- **R8 — Thin history**: a trend with fewer than two points returns the data plus a `note`
  rather than an error.
- **R9 — Export (FR-010)**: `?format=csv` on every dashboard, with formula-injection guarding.

## Constitution Check

I PASS (service reads only) · II PASS · III PASS (router-wide Admin/HR) · IV N/A (read-only) ·
VI PASS · VII PASS (on-demand aggregation, no warehouse or caching).
