# Tasks: Recruitment / ATS

**Input**: plan.md, contracts/recruitment-api.md, quickstart.md. Backend only (frontend repo owns UI).

## Phase 1: Setup
- [X] T001 Migration `recruitment_ats`: `Candidate.phone/createdAt`, `InterviewRound.feedback/recordedAt`
- [X] T002 `employee/service.getEmployeeSummary()` read helper for cross-module scope checks
- [X] T003 Shared `lib/handle.ts` and `openapi.documentRoute()` helpers

## Phase 2: US1 — Job postings (P1)
- [X] T004 schema/repository/service for create, update, list (role-scoped), get posting
- [X] T005 Routes + OpenAPI for `/postings` (HR/Admin write; list scoped per FR-014)

## Phase 3: US2 — Candidates & applications (P1)
- [X] T006 Candidate create/search/get (HR/Admin)
- [X] T007 Create application at APPLIED; `POSTING_NOT_OPEN`; P2002 → `DUPLICATE_APPLICATION`

## Phase 4: US3 — Pipeline (P1)
- [X] T008 `moveApplicationStage`: HR any direction; Manager own department and non-terminal; audit
- [X] T009 Pipeline/detail views with Manager department scope; `isTerminal` on responses

## Phase 5: US4 — Interviews (P2)
- [X] T010 Schedule (INTERVIEW stage, active interviewer), reassign (pending only), `/interviews/me`
- [X] T011 Record result: assigned interviewer or HR/Admin, once

## Phase 6: Polish
- [X] T012 Unit tests `service.test.ts` (17 tests)
- [X] T013 `scripts/e2e/005-recruitment.mjs` (21 checks) + `scripts/e2e/run-all.mjs`, wired into CI
- [X] T014 Mount router in `app.ts`; contract + quickstart
