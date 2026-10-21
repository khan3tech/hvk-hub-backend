# Contract: Performance API (`/api/performance`) — authenticated

| Method & path | Who | Notes |
|---|---|---|
| POST `/goals` | employee | `{description, targetDate}` → PENDING_APPROVAL |
| GET `/goals/me` · GET `/employees/:employeeId/goals` | self / current manager / HR | |
| POST `/goals/:id/approve` | current manager, HR/Admin | → ACTIVE; 409 `INVALID_STATE` |
| POST `/goals/:id/request-changes` | current manager, HR/Admin | `{note}` → CHANGES_REQUESTED |
| PATCH `/goals/:id` | owner | revise → PENDING_APPROVAL |
| POST `/goals/:id/progress` | owner | `{progressPercent?, progress?, completed?}`; 409 `PERIOD_ENDED` |
| POST `/cycles` · GET `/cycles` · GET `/cycles/:id/status` | ADMIN, HR | `{name, startDate, endDate, scopeType, departmentId?, employeeIds?}`; status `{completed, pending, overdue, notRequired, reviews[]}` |
| GET `/reviews/to-do` | any | in-progress reviews the caller writes |
| GET `/reviews/:id` | employee, reviewer, HR/Admin | includes the period's goals, `ratingLabel`, `overdue` |
| PATCH `/reviews/:id` | reviewer | `{rating?: "1".."5", managerComments?}` |
| PUT `/reviews/:id/self-reflection` | reviewed employee | `{employeeComments}` |
| POST `/reviews/:id/finalize` | reviewer | rating required → FINAL |
| POST `/reviews/:id/corrections` | ADMIN, HR | `{rating?, managerComments?, reason}` on FINAL |
| GET `/employees/:employeeId/history` | self / current manager / HR | goals + reviews |
