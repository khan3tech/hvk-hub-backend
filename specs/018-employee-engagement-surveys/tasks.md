# Tasks: Employee Engagement & Pulse Surveys

**Input**: plan.md, contracts/surveys-api.md, quickstart.md. Backend only.

- [X] T001 Migration `engagement_surveys` (audience snapshot, minResponses, closedAt)
- [X] T002 US1: create = send with fixed questions; company/department audience snapshot (FR-001/002/006/010)
- [X] T003 US2: pending list; anonymous one-time submission (unlinked rows, random id, day-only times) (FR-003/004)
- [X] T004 US2: results withheld below threshold; eNPS, distribution, shuffled texts (FR-005/007)
- [X] T005 US3: chronological trend with response rate and status (FR-008/009); close
- [X] T006 Unit tests (8); `scripts/e2e/018-surveys.mjs` (14 checks incl. DB-level anonymity); CI e2e gets DATABASE_URL
