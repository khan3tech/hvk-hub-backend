# Tasks: Interactive Org Chart

**Input**: plan.md, contracts/orgchart-api.md, quickstart.md. Backend only.

## Phase 1: Setup
- [X] T001 Migration `org_chart_top`; 002 department-head setter; designationId in summaries
- [X] T002 Pure graph: forest, cycle extraction, bounded root path (`compute.ts`)

## Phase 2: US1 — Explore (P1)
- [X] T003 Chart with shallow depth, child counts, leaves, `myPath` (FR-001/002/006, US1.4)
- [X] T004 Field-level visibility by role (FR-003); offboarded excluded (FR-005)

## Phase 3: US2 — Search (P1)
- [X] T005 Name search with expand path; empty result (FR-004)

## Phase 4: US3 — Structural gaps (P2)
- [X] T006 HR overlay: orphans (vs designated top), headless departments, cycles (FR-007/008); `PUT /top`

## Phase 5: Polish
- [X] T007 Unit tests (7, incl. cycles and a 5,051-person size bound); `scripts/e2e/016-org-chart.mjs` (13 checks); e2e platform token cached per run
