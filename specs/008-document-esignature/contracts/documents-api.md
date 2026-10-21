# Contract: Documents, e-Signature & Policies

Uploads are `multipart/form-data` with one `file` field (PDF/PNG/JPEG/DOCX, ≤ `DOCUMENT_MAX_BYTES`).
Errors: 413 `FILE_TOO_LARGE`, 415 `UNSUPPORTED_FILE_TYPE`, 400 `FILE_REQUIRED`.

## `/api/documents` (authenticated)

| Method & path | Roles | Notes |
|---|---|---|
| POST `/employees/:employeeId` | ADMIN, HR | fields `label`, `managerVisible?` → 201 Document (same label = next version) |
| GET `/employees/:employeeId?history` | owner, HR/Admin, direct Manager (manager-visible only) | current versions by default |
| POST `/candidates/:candidateId` | ADMIN, HR | fields `label` |
| GET `/candidates/:candidateId?history` | ADMIN, HR | |
| GET `/:id/download` | per visibility rules | streams the file |
| POST `/:id/signature-requests` | ADMIN, HR | `{recipientEmployeeId | recipientCandidateId, applicationId?}`; current version only; candidate response includes `signingUrl` once; 409 `RECIPIENT_MISMATCH`/`RECIPIENT_INACTIVE`/`NOT_CURRENT_VERSION` |
| GET `/signatures?status&applicationId` | any | HR/Admin all; others theirs |
| GET `/signatures/:id` | HR/Admin or recipient | includes `document`, `actionable` |
| POST `/signatures/:id/sign` | recipient employee | `{fullName}`; 409 `ALREADY_SIGNED`/`NOT_ACTIONABLE` |

## `/api/policies` (authenticated)

| Method & path | Roles | Notes |
|---|---|---|
| POST `/` | ADMIN, HR | multipart `title` + optional `file` |
| GET `/` | any | each with `myAcknowledgedAt` |
| POST `/:id/acknowledge` | any employee | idempotent |
| GET `/:id/status` | ADMIN, HR | `{acknowledgedCount, pendingCount, acknowledged[], pending[]}` |

## `/api/public/signatures/:token` (no login, rate-limited)

GET (request + document metadata), GET `/download`, POST `/sign` `{fullName}`.
