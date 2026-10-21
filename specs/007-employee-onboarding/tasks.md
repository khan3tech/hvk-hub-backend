# Tasks: Employee Onboarding

**Input**: plan.md, contracts/onboarding-api.md, quickstart.md. Backend only.

## Phase 1: Setup
- [X] T001 Migration `employee_onboarding` (`ownerEmployeeId`, `position`, `createdAt` on OnboardingTask)
- [X] T002 employee extension points `onEmployeeCreated`, `setOnboardingStatusProvider`; `dateOfJoining` on `getEmployeeSummary`

## Phase 2: US1 — Checklist at hire (P1)
- [X] T003 Template seed + CRUD (FR-010); copy-on-attach
- [X] T004 Auto-attach via hook (FR-001); manual attach (FR-005); one-off tasks add/edit/remove (FR-002)
- [X] T005 `onboardingStatus` on employee get/list (FR-007)

## Phase 3: US2 — Owners complete tasks (P1)
- [X] T006 Ownership rules (role / reassigned employee / HR-Admin), default HR (FR-003)
- [X] T007 Conditional completion with attribution (FR-004, SC-003); reassignment to active employees (FR-006); `/tasks/me`

## Phase 4: US3 — Overview (P2)
- [X] T008 Overview with counts, days since joining, stalled flag; completed drop out (FR-008/009, SC-004)

## Phase 5: Polish
- [X] T009 Unit tests (10 onboarding + 1 employee hook)
- [X] T010 `scripts/e2e/007-onboarding.mjs` (17 checks); routes + OpenAPI + contract
