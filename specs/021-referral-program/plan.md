# Implementation Plan: Employee Referral Program

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New `referrals` module (`/api/referrals`):

- employees refer candidates into 005's pipeline;
- each referral snapshots the current bonus terms;
- a pipeline hook moves the bonus through pending, payable, forfeited or closed;
- HR schedules a payable bonus into a payroll period, where it appears as its own payslip line
  and is then marked paid, exactly once.

Backend only.

## Technical Context

- **Migrations**: `referral_program` adds the enum value IN_PIPELINE. It is split from
  `referral_program_columns` (which adds `hireEmployeeId`, payroll period, `closedReason`,
  `createdAt`, and the default IN_PIPELINE) because PostgreSQL can't use a new enum value in the
  same transaction that adds it.
- **New hooks**:
  - recruitment `onApplicationStageChanged`;
  - payroll `setOneOffEarningsProvider` (one-off lines are added after proration, kept out of the
    daily rate, and included in gross for statutory);
  - `onCandidateDeleted` cleanup for referrals.
- **Helpers**: recruitment `getApplicationBrief`, employee `findEmployeeSummaryByEmail`.

## Research & decisions

- **R1 — Entry (FR-001/002)**: a referral is an application through 005's shared
  `applyCandidate` (source REFERRAL, `referredByEmployeeId`), so whichever channel applies first
  wins and later duplicates get 409. The referee's resume is stored as a candidate document. An
  employee can't refer themselves.
- **R2 — Terms snapshot (FR-004/010)**: the org config (bonus amount, qualifying days ≥ 0) is
  copied onto each referral at submission. Later config edits affect new referrals only.
- **R3 — Lifecycle (FR-005–007)** follows the stage hook:
  - HIRED → PENDING with `qualifyingUntil = now + days` (zero days → PAYABLE at once);
  - REJECTED → CLOSED_NO_BONUS;
  - an HR correction back into the pipeline before payout → IN_PIPELINE.

  Transitions are conditional.
- **R4 — Qualifying (FR-005/006, SC-003)**: the hire must exist as an employee; it is matched by
  candidate email, or linked by HR via `/link-hire`. Once the period ends with the hire ACTIVE,
  the bonus becomes PAYABLE; if they were offboarded before it ended, FORFEITED. Without an
  employee record the bonus waits in PENDING. Evaluation is hourly (scheduler) and also before
  listings. A referrer's own exit never auto-forfeits (`referrerActive` flag for HR to decide).
- **R5 — Payroll (FR-008/009, SC-004/005)**: HR schedules a PAYABLE bonus for a month/year.
  - The payroll run asks the provider for that employee's bonuses in that period and adds
    `Referral bonus (<candidate>)` as a separate earning, then marks them PAID.
  - Scheduling needs PAYABLE, so a paid bonus can never move to another period.
  - Re-running the same period includes the same bonus once, because the payslip is replaced
    rather than duplicated.
- **R6 — Visibility (FR-003)**: a referrer sees stage, status and bonus only, never interview
  rounds or feedback. HR sees referrer status, the hire link and the payroll period.

## Constitution Check

I PASS (recruitment/payroll/employee via services and hooks) · II PASS · III PASS · IV PASS
(application audit plus conditional transitions) · VI PASS · VII PASS (single company-wide
amount, "paid" = on a payslip).
