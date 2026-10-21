# Tasks: Resignation & Exit Management

**Input**: plan.md, contracts/exit-api.md, quickstart.md. Backend only.

## Phase 1: Setup
- [X] T001 Migration `resignation_exit`; `lib/scheduler.ts` (started in `server.ts`)
- [X] T002 Generalize employee decorators (`registerEmployeeDecorator`); `listDirectReportIds`

## Phase 2: US1 — Submit (P1)
- [X] T003 Submit with proposed day, one active at a time, notify manager + HR; own/manager/HR views

## Phase 3: US2 — Acknowledge & notice (P1)
- [X] T004 Acknowledge (their manager or HR) with optional adjusted day; conditional transition
- [X] T005 `exitStatus`/`lastWorkingDay` decorator (FR-004); hourly EXIT_DUE prompt (US2.3)

## Phase 4: US3 — Clearance & offboarding (P1)
- [X] T006 Checklist on acknowledgment (IT/FINANCE/HR) + direct-report reassignment flag (FR-005/009)
- [X] T007 Complete tasks; offboard gated on clearance with force override; access revoked via 002 (FR-006/010)
- [X] T008 Exit-interview notes HR-only (FR-007); withdraw closes checklist (FR-008); history kept (FR-011)

## Phase 5: Polish
- [X] T009 Unit tests `exit/service.test.ts` (14)
- [X] T010 `scripts/e2e/009-exit.mjs` (19 checks); routes + OpenAPI + contract
