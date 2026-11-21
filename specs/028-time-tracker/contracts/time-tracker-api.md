# Contract: Time Tracker API (`/api/time`): authenticated

The machine-readable contract is the generated OpenAPI document (`/docs`, non-production).
Errors use `{ error: { code, message, fields? } }`. Durations are **minutes** (integers).
Dates are `YYYY-MM-DD` (org-local); timestamps are ISO-8601 UTC.

## Shapes
```ts
Project   { id, name, code, clientName: string|null, billable, status: "ACTIVE"|"ARCHIVED",
            ownerId, canManage: boolean, memberCount, createdAt }
ProjectDetail extends Project { tasks: Task[], members: { employeeId, name }[] }
Task      { id, projectId, name, status: "ACTIVE"|"ARCHIVED" }
Entry     { id, employeeId, projectId, projectName, projectCode, taskId, taskName, date, minutes,
            note: string|null, billable, source: "MANUAL"|"TIMER", flagged, locked: boolean }
Timer     { id, taskId, taskName, projectId, projectName, startedAt, note: string|null, elapsedSeconds }
Week      { employeeId, employeeName, weekStart, weekEnd, status: "NOT_STARTED"|"DRAFT"|"SUBMITTED"|"APPROVED"|"REJECTED",
            timesheetId: string|null, totalMinutes, billableMinutes, flaggedCount,
            days: { date, minutes }[7], entries: Entry[], submittedAt, decidedAt, decidedByName, reason,
            canEdit, canSubmit, canDecide, canReopen }
TeamRow   { employeeId, employeeName, weekStart, status, timesheetId: string|null, totalMinutes, flaggedCount }
ReportRow { key, label, totalMinutes, billableMinutes, nonBillableMinutes }
```

## Projects & tasks
| Method & path | Roles | Notes / errors |
|---|---|---|
| GET `/projects?status=ACTIVE\|ARCHIVED\|ALL&mine=true` | any | Employee: projects they're a member of. Manager: owned + member. HR/Admin: all. `mine=true` → only ones the caller can log to. → `Project[]` |
| POST `/projects` | ADMIN, HR, MANAGER | `{name, code, clientName?, billable?}` → 201 `ProjectDetail`; 409 `PROJECT_CODE_TAKEN` |
| GET `/projects/:id` | member, owner, HR/Admin; Manager if a direct report is a member | → `ProjectDetail`; 404 otherwise |
| PATCH `/projects/:id` | owner, HR/Admin | `{name?, clientName?, billable?, status?}` → `ProjectDetail` (the code can't be changed) |
| POST `/projects/:id/tasks` | owner, HR/Admin | `{name}` → 201 `Task`; 409 `TASK_EXISTS` |
| PATCH `/tasks/:id` | owner, HR/Admin | `{name?, status?}` → `Task` |
| POST `/projects/:id/members` | owner, HR/Admin | `{employeeIds: string[]}` (adds; active employees only) → `ProjectDetail`; 400 `EMPLOYEE_INACTIVE` |
| DELETE `/projects/:id/members/:employeeId` | owner, HR/Admin | → `ProjectDetail` |

## Time entries
| Method & path | Roles | Notes / errors |
|---|---|---|
| GET `/entries?from&to&employeeId` | any (scoped) | default own; `employeeId` needs Manager-of or HR/Admin (403). Range ≤ 366 days. → `Entry[]` |
| POST `/entries` | any employee | `{taskId, date, minutes, note?, billable?}` → 201 `Entry`. 403 `NOT_A_MEMBER`, 409 `PROJECT_ARCHIVED`, 409 `WEEK_LOCKED`, 409 `DAILY_LIMIT_EXCEEDED` |
| PATCH `/entries/:id` | owner of entry | `{taskId?, date?, minutes?, note?, billable?}` → `Entry`; same errors; 404 if not yours |
| DELETE `/entries/:id` | owner of entry | 204; 409 `WEEK_LOCKED` |

## Timer
| Method & path | Roles | Notes / errors |
|---|---|---|
| GET `/timer` | any employee | → `{ timer: Timer \| null }` |
| POST `/timer/start` | any employee | `{taskId, note?, switch?: boolean}` → 201 `{timer, stoppedEntry: Entry\|null}`. 409 `TIMER_ALREADY_RUNNING` (unless `switch`), 403 `NOT_A_MEMBER`, 409 `PROJECT_ARCHIVED`, 409 `WEEK_LOCKED` |
| POST `/timer/stop` | any employee | `{note?}` → `{entry: Entry}` (flagged if overnight/>12h); 404 `NO_TIMER` |
| PATCH `/timer` | any employee | `{note}` → `{timer}` |
| DELETE `/timer` | any employee | discard → 204; 404 `NO_TIMER` |

## Timesheets
| Method & path | Roles | Notes / errors |
|---|---|---|
| GET `/timesheets/week?weekStart&employeeId` | any (scoped) | `weekStart` any date in the week (normalized to Monday; default this week); `employeeId` default self, else Manager-of or HR/Admin → `Week` |
| POST `/timesheets/submit` | any employee | `{weekStart}` → `Week`. 409 `EMPTY_WEEK`, 409 `TIMER_RUNNING`, 409 `ALREADY_SUBMITTED` |
| GET `/timesheets/team?weekStart&status` | MANAGER (direct reports), HR/Admin (all active) | → `TeamRow[]` |
| POST `/timesheets/:id/approve` | reporting manager, HR/Admin (not self) | → `Week`; 403 `NOT_APPROVER`; 409 `INVALID_STATUS` |
| POST `/timesheets/:id/reject` | reporting manager, HR/Admin (not self) | `{reason}` (10–1000) → `Week`; 403, 409 |
| POST `/timesheets/:id/reopen` | ADMIN, HR (not self) | `{reason}` (10–1000), APPROVED only → `Week`; 409 |

## Reports
| Method & path | Roles | Notes |
|---|---|---|
| GET `/reports/hours?from&to&groupBy=project\|employee\|task&projectId&employeeId&approvedOnly` | any (scoped) | Employee: own; Manager: self + direct reports; HR/Admin: all. → `{ from, to, groupBy, totals: {totalMinutes, billableMinutes, nonBillableMinutes}, rows: ReportRow[] }` |

## Notifications (006)
`TIMESHEET_SUBMITTED` → approver; `TIMESHEET_DECIDED` → employee (approve / reject / reopen). Link: `/time/timesheets?weekStart=<date>&employeeId=<id>`.
