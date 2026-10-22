# Contract: Background Verification (`/api/bgv`) — Admin/HR only

| Method & path | Notes |
|---|---|
| GET `/defaults` · PUT `/defaults` | `{defaultItems: string[]}` |
| POST `/checks` | `{applicationId, items?}` → 201 PENDING; 409 `CHECK_EXISTS` / final application |
| GET `/checks?status` · GET `/checks/:id` · GET `/applications/:applicationId` | detail includes `items[]` (result, notes), `hasUnverified`, `overrides[]` |
| POST `/checks/:id/items` | `{label}` → reopens a completed check |
| POST `/items/:id/result` | `{result: CLEARED|FLAGGED|UNABLE_TO_VERIFY, notes?}`; 409 `RESULT_RECORDED` |

Changes to 005:
- `PATCH /api/recruitment/applications/:id/stage` accepts `justification`. Moving to HIRED
  without a clean complete check → 409 `BACKGROUND_CHECK_INCOMPLETE` / `JUSTIFICATION_REQUIRED`
  unless HR/Admin supplies a justification (recorded as an override).
- `GET /api/recruitment/applications/:id` adds `backgroundCheck`: `{id, status, overallOutcome}`
  for HR/Admin, `{status}` for a Manager, or `null`.
