# Implementation Plan: Public Careers Page & Self-Apply

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New `careers` module serving `/api/public/careers/:org/...` with no authentication:

- browse open roles;
- self-apply with a resume into 005's existing pipeline;
- check status with email plus reference.

It has no records of its own; it's a public entry point into 005. HR can delete a candidate on
request. Organizations are addressed by their 015 slug. Backend only (the page is in the
frontend repo).

## Technical Context

- **Migration `public_careers`**: `JobPosting.description` (optional; HR sets it via 005's
  create/update) and `Application.publicReferenceHash` (unique).
- **New code**: `lib/botcheck.ts`.
- **005 refactor**: a shared `applyCandidate()` so every entry point (internal, public, and later
  referral) enforces the same rules, plus `findOrCreateCandidate`, `applyFromOutside`,
  reference lookup, `deleteCandidate` with an `onCandidateDeleted` cleanup hook, and
  `DELETE /recruitment/candidates/:id`.
- **008 additions**: `storeCandidateFile` and `deleteCandidateDocuments`; storage gains
  `remove()`.

## Research & decisions

- **R1 — Same pipeline (FR-004/005, SC-004)**: public applications call 005's shared
  `applyCandidate`, so the open-posting check and the candidate/posting unique constraint are
  literally the same code. Candidates are reused by email within an org, so a duplicate is
  caught across public and internal entries. Source is PUBLIC and stage APPLIED.
- **R2 — Order of operations**: bot check → org active → resume type (PDF/DOCX; size/type also
  checked by the shared upload middleware, FR-011) → posting still OPEN (FR-006, 409) →
  candidate → application → resume stored. A rejected attempt therefore leaves no stray
  candidate or file.
- **R3 — Bot mitigation (FR-007)**: no CAPTCHA provider is configured, so there's a hashcash
  challenge.
  - A JWT carries a nonce and difficulty (`BOT_POW_BITS`, default 16 ≈ 65k SHA-256s).
  - The submission must also respect a minimum fill time (`BOT_MIN_FILL_MS`, default 3 s) and
    leave the `website` honeypot field empty.
  - Each challenge works once (an in-memory guard, sufficient for a single instance).
  - IP rate limits apply too.

  `verifyHumanCheck()` is the single swap point for a hosted CAPTCHA.
- **R4 — Status (FR-008/009, SC-005)**: the reference is `TL-` plus 12 hex characters, shown
  once and stored only as a SHA-256 hash. A lookup must match the reference and the candidate's
  email; every miss returns the same generic 404. Stages are simplified for candidates: Received,
  Under review, Interviewing, Offer stage, Hired, Not selected.
- **R5 — Deletion (FR-010)**: removes the candidate's documents, stored files and signature
  requests (via 008's hook), then interview rounds, applications and the candidate in one
  transaction. The audit row records only that a removal happened.
- **R6 — Tenancy**: an unknown or suspended org's careers page is 404.

## Constitution Check

I PASS (recruitment/documents via exported services and hooks) · II PASS · III PASS (public
routes expose only open-posting fields and per-application status) · IV PASS · VI PASS · VII
PASS (no candidate accounts, no third-party CAPTCHA dependency).
