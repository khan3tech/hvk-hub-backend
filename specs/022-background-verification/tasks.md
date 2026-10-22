# Tasks: Background Verification

**Input**: plan.md, contracts/bgv-api.md, quickstart.md. Backend only.

- [X] T001 Migration `background_verification` (+ BackgroundCheckSettings, HireOverride.kind)
- [X] T002 005 hooks: hire gate before HIRED (+ stage `justification`), application decorator; candidate-deletion cleanup
- [X] T003 US1: defaults, initiate (one per application), status on application views (FR-001, US1.3)
- [X] T004 US2: record results once, auto-complete with derived outcome, add item reopens (FR-002–004)
- [X] T005 US3: gate — clean passes, incomplete/flagged need HR/Admin justification, overrides recorded (FR-005–007)
- [X] T006 HR/Admin-only routes (FR-008); history retained (FR-009)
- [X] T007 Unit tests (8); `scripts/e2e/022-bgv.mjs` (15 checks); 005/021 e2e updated to hire via override
