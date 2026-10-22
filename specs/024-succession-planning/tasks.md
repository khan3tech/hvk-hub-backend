# Tasks: Succession Planning

**Input**: plan.md, contracts/succession-api.md, quickstart.md. Backend only.

- [X] T001 Migration `succession_planning` (plan marking, candidate provenance/invalidation, readiness history)
- [X] T002 Hooks: `onEmployeeOffboarded`; requester-aware employee decorators; org chart critical-position provider
- [X] T003 US1: mark/unmark critical; HR-only flag on profile and org chart (FR-001, FR-010)
- [X] T004 US2: successors (active employees only), readiness changes with history, removal kept as invalid (FR-002–004)
- [X] T005 Offboarded successors invalidated on every plan; vacant positions keep plans (FR-005, FR-006)
- [X] T006 US3: risk-grouped overview, department filter, multi-position successors (FR-007–009)
- [X] T007 Unit tests (8); `scripts/e2e/024-succession.mjs` (14 checks); 014/016/021 e2e re-run
