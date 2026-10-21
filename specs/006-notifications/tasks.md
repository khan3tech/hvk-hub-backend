# Tasks: Notifications

**Input**: plan.md, contracts/notifications-api.md, quickstart.md. Backend only.

## Phase 1: Setup
- [X] T001 `lib/email.ts` EmailSender interface + LogEmailSender default
- [X] T002 auth service read helpers `findUserForEmployee`, `listUsersByRole`

## Phase 2: Foundation
- [X] T003 notifications repository + `notifyEmployees`/`notifyRoles`/`notifyDepartmentManagers` (in-app first, email non-fatal, offboarded never emailed)

## Phase 3: US1 — Leave decisions (P1)
- [X] T004 003 hooks: leave filed → manager (FR-002); approved/rejected → requester with dates/reason (FR-001)

## Phase 4: US2 — Notification center (P1)
- [X] T005 `GET /notifications`, `/unread-count`, `POST /:id/read`, `/read-all` (self-scoped) + OpenAPI

## Phase 5: US3 — Payroll & recruitment (P2)
- [X] T006 004 hook: one run summary with skipped employees to the HR/Admin who ran it (FR-003)
- [X] T007 005 hooks: interviewer on schedule/reassign (FR-004); HR/Admin + department Managers on result (FR-005)

## Phase 6: Polish
- [X] T008 Unit tests `notifications/service.test.ts` (8); existing module tests mock notifications
- [X] T009 `scripts/e2e/006-notifications.mjs` (11 checks)
