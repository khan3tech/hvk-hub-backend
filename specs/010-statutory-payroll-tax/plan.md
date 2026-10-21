# Implementation Plan: Statutory Payroll Tax & Compliance

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New `statutory` module (`/api/statutory`, Admin/HR only) holds configurable, effective-dated
deduction components (flat, percentage, progressive brackets) and per-employee exemptions. It plugs
a calculator into payroll's run so every payslip carries itemized `statutoryDeductions`, and
produces per-period compliance reports exportable as CSV. No jurisdiction is hardcoded
(Assumptions). Backend only.

## Technical Context

Existing `StatutoryComponent`, `StatutoryExemption`, `ComplianceReport`. Migration
`statutory_payroll_tax` adds:

- StatutoryComponent `groupId`, `active`, `createdById`, `createdAt`;
- StatutoryExemption `groupId` (unique per employee), `reason`, `createdAt`;
- Payslip `statutoryDeductions Json`;
- ComplianceReport `generatedById`.

## Research & decisions

- **R1 — Rule types (FR-001, edge case)**: validated per type with a zod discriminated union.
  - `FLAT {amount}`;
  - `PERCENTAGE {percent, base: BASIC|BASIC_PLUS_HRA|GROSS, cap?}`;
  - `BRACKET {base, period: MONTHLY|ANNUAL, brackets[{upTo|null, percent}]}`, where brackets
    ascend and end open-ended. Brackets are progressive: each slice is taxed at its own rate.
- **R2 — Versions (FR-002)**: a component is a set of rows sharing `groupId`, each with an
  `effectiveFrom`. Edits always add a new row. A period uses the latest version with
  `effectiveFrom ≤ period end` (ties go to the newest row). `active:false` discontinues the
  component from that date.
- **R3 — Payroll hook**: `payroll.setStatutoryCalculator()` is registered in `app.ts`, so payroll
  never imports statutory (Principle I). Statutory reads payslips through
  `payroll.getPayslipsOrgWide`, so there's one import direction and no cycle.
- **R4 — Proration (FR-010)**: percentages apply to prorated earnings and flat amounts scale by
  the proration ratio. Annual brackets annualize the *full* monthly base, take 1/12, then
  prorate. Monthly brackets apply to prorated pay. Lines are rounded to 2 decimals, and zero
  lines are omitted.
- **R5 — Itemization (FR-005)**: `Payslip.statutoryDeductions` is a list of
  `{groupId, componentId, name, amount}`, separate from the non-statutory `deductions` map.
  `netPay` subtracts both. Payroll's existing upsert replaces the lines on a re-run (FR-008).
  Rule edits never touch generated payslips until a re-run (edge case).
- **R6 — Reports (FR-006/007, SC-003)**: generated from the period's current payslips, so
  totals equal the sum of lines by construction. Every generation is stored (newest first). The
  CSV export contains component totals, a grand total, then per-employee lines, with cells
  starting `= + - @` neutralised against spreadsheet formula injection.
- **R7 — Country**: the `country` field is stored but not yet used for filtering; 026
  (multi-country payroll) introduces employee countries.

## Constitution Check

I PASS (hook + one-way import) · II PASS · III PASS (whole router Admin/HR) · IV PASS
(ActivityLog for components, versions, exemptions, reports) · VI PASS · VII PASS (no e-filing,
no rule engine beyond three rule types).
