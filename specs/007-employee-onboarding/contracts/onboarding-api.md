# Contract: Onboarding API (`/api/onboarding`)

All endpoints require `authenticate`.

| Method & path | Roles | Notes |
|---|---|---|
| GET `/templates` | ADMIN, HR | standard tasks (defaults seeded on first use) |
| POST `/templates` | ADMIN, HR | `{description, ownerRole?, order?}`; future checklists only |
| PATCH `/templates/:id` · DELETE `/templates/:id` | ADMIN, HR | 204 on delete |
| GET `/overview` | ADMIN, HR | `[{checklistId, employeeId, name, dateOfJoining, daysSinceJoining, completedCount, totalCount, stalled}]` |
| GET `/me` | any | caller's checklist |
| GET `/tasks/me` | any | incomplete tasks routed to the caller |
| POST `/checklists/:employeeId` | ADMIN, HR | manual attach; 409 `CHECKLIST_EXISTS` |
| GET `/checklists/:employeeId` | HR/Admin, hire, manager, reassigned owner | `{…, status, completedCount, totalCount, tasks[{…, canComplete}]}` |
| POST `/checklists/:employeeId/tasks` | ADMIN, HR | `{description, ownerRole?, ownerEmployeeId?}` |
| PATCH `/tasks/:id` | ADMIN, HR | `{description?, ownerRole?, ownerEmployeeId?|null}`; 409 `OWNER_INVALID` |
| DELETE `/tasks/:id` | ADMIN, HR | 204 |
| POST `/tasks/:id/complete` | owner, ADMIN, HR | 403 non-owner; 409 `ALREADY_COMPLETE` |

`GET /employees` (HR/Admin/Manager) and `GET /employees/:id` add
`onboardingStatus: IN_PROGRESS | COMPLETE | NONE`.
