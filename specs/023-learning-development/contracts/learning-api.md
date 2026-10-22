# Contract: Learning & Development (`/api/learning`)

Assignment status is `INCOMPLETE | COMPLETE | OVERDUE` (overdue = incomplete past `dueDate`).

| Method & path | Who | Notes |
|---|---|---|
| GET `/me` | any | my assignments with course, dueDate, status, completedAt |
| GET `/assignments/:id` | assignee, Admin/HR | 404 for others |
| POST `/assignments/:id/complete` | assignee | optional multipart `file`; required when `requiresProof` → 400 `PROOF_REQUIRED`; 409 `ALREADY_COMPLETE` |
| GET `/courses?archived` · POST `/courses` | Admin/HR | `{title, description?, contentUrl?, requiresProof?, isComplianceRequired?}` |
| GET `/courses/:id` · PATCH `/courses/:id` | Admin/HR | |
| POST `/courses/:id/archive` | Admin/HR | no new assignments; records kept |
| POST `/courses/:id/assign` | Admin/HR | `{audience: COMPANY|DEPARTMENT|EMPLOYEES, departmentId?, employeeIds?, dueDate?}` → 201 `{assigned, alreadyAssigned}`; 409 `COURSE_ARCHIVED` |
| GET `/assignments?courseId&employeeId&status` | Admin/HR | tracking view |
| GET `/compliance` | Admin/HR | per compliance course: `assigned`, `completed`, `outstanding`, `outstandingEmployees[{employeeId, name, dueDate, overdue}]` (active workforce) |

New employees are auto-enrolled in compliance courses that were assigned company-wide or to their
department (FR-007).
