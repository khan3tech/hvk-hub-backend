# Implementation Plan: Recruitment / ATS

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

Internal applicant tracking: job postings, candidates, applications moving through a fixed
six-stage pipeline (APPLIED → SCREEN → INTERVIEW → OFFER → HIRED/REJECTED), and interview rounds
with an assigned interviewer who records the result. Fills in the scaffolded
`src/modules/recruitment/*` stubs; backend only. The UI lives in the separate frontend repository
since the 2026-10-20 repo split (constitution 2.2.0).

## Technical Context

**Language/Version**: TypeScript (Node 20), strict. **Dependencies**: Express, Prisma, zod,
Vitest; nothing new. **Storage**: PostgreSQL. `JobPosting`, `Candidate`, `Application`,
`InterviewRound` already existed; migration `recruitment_ats` adds `Candidate.phone`,
`Candidate.createdAt`, `InterviewRound.feedback`, `InterviewRound.recordedAt`.
**Testing**: Vitest unit tests (repository mocked) + `scripts/e2e/005-recruitment.mjs` against a
live API and Postgres. **Scale**: single org, 15 endpoints under `/api/recruitment`.

## Research & decisions

- **R1 — Terminal stages**: HIRED and REJECTED are terminal (FR-009); responses carry
  `isTerminal`. HR/Admin may still move out of them as an audited correction (FR-007); a Manager
  may not (`APPLICATION_FINAL`).
- **R2 — Manager department scope**: read live from 002 via a new
  `employee/service.getEmployeeSummary()` (Principle I: no cross-module Prisma reads). A Manager
  sees/actions only postings whose `departmentId` equals their own (FR-008, SC-005).
- **R3 — Duplicates**: the existing `@@unique([candidateId, jobPostingId])` is the backstop; a
  P2002 maps to 409 `DUPLICATE_APPLICATION` (FR-005), which also covers concurrent requests.
- **R4 — Closed postings**: only OPEN postings accept applications (`POSTING_NOT_OPEN`); existing
  applications stay visible and movable (edge case).
- **R5 — Interview results**: recorded once (`RESULT_ALREADY_RECORDED`) by the assigned
  interviewer or HR/Admin (FR-011). Scheduling requires the INTERVIEW stage. Reassigning only a
  PENDING round, and only to an ACTIVE employee (FR-012, offboarded-interviewer edge case).
- **R6 — Resume**: `resumeUrl` link to the stored file (spec Assumptions: one file, no parsing;
  uploads arrive with 008).
- **R7 — Audit**: every create/update/stage change/interview action writes an `ActivityLog` row
  (`recruitment.*` actions) with before/after where meaningful (Principle IV).

## Data model (deltas)

| Entity | Field | Notes |
|---|---|---|
| Candidate | `phone String?`, `createdAt` | "contact info" (FR-003); newest-first search |
| InterviewRound | `feedback String?`, `recordedAt DateTime?` | result + free-text feedback (US4) |

## Constitution Check

| Principle | Status |
|---|---|
| I. Modular Monolith — reads 002 only via `getEmployeeSummary` | PASS |
| II. Independent Type Safety — module-local zod schemas | PASS |
| III. Security & RBAC — route `authorize(...)` + department scope in service | PASS |
| IV. Auditability — ActivityLog on every mutation | PASS |
| VI. Multi-tenancy readiness — every query scoped by `orgId` | PASS |
| VII. Simplicity — fixed pipeline, no custom stages, no file storage | PASS |

## Project Structure

```text
src/modules/recruitment/{schema,repository,service,controller,routes}.ts + service.test.ts
src/modules/employee/service.ts   # + getEmployeeSummary (read helper for other modules)
src/lib/handle.ts, src/lib/openapi.ts (documentRoute)   # shared route/doc helpers
prisma/migrations/*_recruitment_ats
scripts/e2e/005-recruitment.mjs
```
