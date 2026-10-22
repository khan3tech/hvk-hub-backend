# Implementation Plan: Background Verification

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New `bgv` module (`/api/bgv`, HR/Admin only) covering:

- background checks on applications, with per-item results recorded by hand;
- automatic completion and outcome;
- a hire gate in 005's pipeline: no HIRED without a clean completed check, unless HR/Admin
  overrides with a recorded justification.

Backend only.

## Technical Context

- **Migration `background_verification`**:
  - BackgroundCheck `initiatedById`, `createdAt`, `completedAt`;
  - BackgroundCheckItem `recordedById`, `recordedAt`, `createdAt`;
  - HireOverride `kind`;
  - new `BackgroundCheckSettings` (org default items).
- **005 hooks**: `setHireGate` (runs before any move to HIRED; stage moves accept an optional
  `justification`) and `setApplicationDecorator` (adds role-aware check status to application
  views). Candidate deletion also removes checks and overrides.

## Research & decisions

- **R1 — Initiation (FR-001)**: one check per application (unique), with items chosen per
  initiation or the org defaults (Employment history, Education, Professional references,
  Identity verification). Not allowed on HIRED/REJECTED applications.
- **R2 — Results (FR-002/003, SC-002)**: CLEARED, FLAGGED or UNABLE_TO_VERIFY, plus notes. Each
  item is recorded once (a conditional update) to keep history; re-verification means a new
  item.
  - The status is recomputed every time: PENDING with no results, IN_PROGRESS with some,
    COMPLETE with all.
  - The outcome is FLAGGED if any item is flagged, otherwise CLEARED. UNABLE_TO_VERIFY is never
    collapsed into a flag; it is surfaced as `hasUnverified`.
- **R3 — Reopen (FR-004)**: adding an item recomputes, taking a COMPLETE check back to
  IN_PROGRESS with the outcome cleared.
- **R4 — Hire gate (FR-005–007, SC-003)**:
  - COMPLETE + CLEARED → proceeds;
  - otherwise only HR/Admin with a `justification` (≥ 10 characters) proceed, recorded as a
    HireOverride of kind INCOMPLETE_CHECK or FLAGGED_CHECK;
  - everyone else gets 409 `BACKGROUND_CHECK_INCOMPLETE` / `JUSTIFICATION_REQUIRED`.

  OFFER isn't gated, so conditional offers proceed in parallel (edge case). Rejection is
  unchanged, and the check is retained.
- **R5 — Visibility (FR-008, SC-004)**: every `/bgv` route is HR/Admin only. On an application
  view, HR/Admin see `{id, status, overallOutcome}` and a Manager sees only `{status}` (US1.3) —
  never items, results or notes.
- **R6 — Existing flows**: the 005 and 021 e2e scripts now hire with an HR override
  justification, reflecting the new rule.

## Constitution Check

I PASS (hooks; bgv reads applications via 005's service) · II PASS · III PASS · IV PASS
(ActivityLog for initiation, results, items, overrides; HireOverride rows) · VI PASS · VII PASS
(manual results, no vendor integration).
