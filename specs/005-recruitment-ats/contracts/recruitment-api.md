# Contract: Recruitment API (`/api/recruitment`)

The machine-readable contract is the generated OpenAPI document (`/docs`, non-production),
registered from `src/modules/recruitment/routes.ts`. All endpoints require `authenticate`.
Errors use `{ error: { code, message, fields? } }`.

| Method & path | Roles | Notes / errors |
|---|---|---|
| GET `/postings?status&departmentId` | any | OPEN for everyone; all statuses for HR/Admin and a Manager's own department |
| POST `/postings` | ADMIN, HR | `{title, departmentId, openings}` → 201, status OPEN; 400 unknown department |
| GET `/postings/:id` | any | non-OPEN postings need pipeline access (403) |
| PATCH `/postings/:id` | ADMIN, HR | `{status?, openings?}` |
| GET `/postings/:id/applications` | ADMIN, HR, MANAGER | Manager: own department only (403) |
| GET `/candidates?q` | ADMIN, HR | name/email search |
| POST `/candidates` | ADMIN, HR | `{name, email, phone?, resumeUrl}` → 201 |
| GET `/candidates/:id` | ADMIN, HR | 404 |
| POST `/applications` | ADMIN, HR | `{candidateId, jobPostingId}` → 201 at APPLIED; 409 `DUPLICATE_APPLICATION`, 409 `POSTING_NOT_OPEN` |
| GET `/applications/:id` | ADMIN, HR, MANAGER | includes candidate, posting, `interviewRounds[]`, `isTerminal` |
| PATCH `/applications/:id/stage` | ADMIN, HR, MANAGER | `{stage}`; Manager: own department, 409 `APPLICATION_FINAL` from HIRED/REJECTED |
| POST `/applications/:id/interviews` | ADMIN, HR | `{interviewerId, scheduledAt}`; 409 `WRONG_STAGE`, 409 `INTERVIEWER_INVALID` |
| GET `/interviews/me` | any | rounds assigned to the caller |
| PATCH `/interviews/:id/interviewer` | ADMIN, HR | `{interviewerId}`; pending rounds only |
| POST `/interviews/:id/result` | assigned interviewer, ADMIN, HR | `{result: PASS|FAIL, feedback?}` → 200; 403 others; 409 `RESULT_ALREADY_RECORDED` |
