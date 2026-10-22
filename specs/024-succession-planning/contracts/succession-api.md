# Contract: Succession Planning (`/api/succession`) — Admin/HR only

Readiness: `READY_NOW | READY_1_2_YEARS | DEVELOPING`. Risk: `NO_COVERAGE | NOT_READY | READY_NOW`.
`:id` under `/positions` is the position holder's employee id.

| Method & path | Notes |
|---|---|
| GET `/overview?departmentId` | `{totals, groups: {NO_COVERAGE, NOT_READY, READY_NOW}: [{planId, position{…, vacant}, risk, validSuccessors, readyNow}], multiPositionSuccessors[{employee, positions[]}]}` |
| GET `/positions/:id` | plan: `position{…, vacant}`, `isCritical`, `risk`, `successors[{id, employee, readinessLevel, isValid, invalidReason, history[]}]` |
| PUT `/positions/:id` | mark critical (active employees only; 409 otherwise) |
| DELETE `/positions/:id` | unmark; the plan is kept |
| POST `/positions/:id/successors` | `{employeeId, readinessLevel, note?}` → 201; 400 `SUCCESSOR_NOT_ACTIVE`; 409 `SUCCESSOR_EXISTS` / not critical |
| PATCH `/successors/:id` | `{readinessLevel, note?}`; history row added; 409 if not valid |
| DELETE `/successors/:id` | marks not valid ("Removed by HR"); kept |

Other modules:
- `GET /api/employees/:id` and lists add `criticalPosition` for HR/Admin requesters only.
- Org chart nodes add `criticalPosition` to the HR/Admin overlay.
- Offboarding an employee invalidates their successor entries ("Offboarded").
