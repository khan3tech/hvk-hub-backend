# Contract: Resignation & Exit API (`/api/exit`)

All endpoints require `authenticate`.

| Method & path | Roles | Notes |
|---|---|---|
| POST `/resignations` | any active employee | `{proposedLastDay: YYYY-MM-DD, reason?}` → 201 PENDING; 409 `RESIGNATION_EXISTS`; 400 past date |
| GET `/resignations/me` | any | own, without exit-interview notes |
| GET `/resignations?status` | ADMIN, HR, MANAGER | Manager: direct reports only |
| GET `/resignations/:id` | employee, their manager, HR/Admin | notes HR/Admin only |
| POST `/resignations/:id/acknowledge` | their MANAGER, HR, ADMIN | `{confirmedLastDay?}` → SERVING_NOTICE + exit checklist; 409 `INVALID_STATE` |
| POST `/resignations/:id/withdraw` | ADMIN, HR | → WITHDRAWN, checklist closed, employee stays ACTIVE |
| PUT `/resignations/:id/exit-interview` | ADMIN, HR | `{notes}` |
| GET `/resignations/:id/checklist` | ADMIN, HR | `{tasks[], remainingCount, reportsToReassign, closedAt}` |
| POST `/resignations/:id/offboard` | ADMIN, HR | `{force?}`; 409 `EXIT_CLEARANCE_INCOMPLETE` with `fields.remainingTasks`; → COMPLETED and employee OFFBOARDED |
| POST `/tasks/:id/complete` | ADMIN, HR | 409 `ALREADY_COMPLETE` / `CHECKLIST_CLOSED` |

`GET /employees[/:id]` adds `exitStatus` and `lastWorkingDay`. Notifications:
`RESIGNATION_SUBMITTED` (manager + HR), `RESIGNATION_ACKNOWLEDGED` (employee, + email),
`EXIT_DUE` (HR, once the last day has passed).
