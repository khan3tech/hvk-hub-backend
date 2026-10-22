# Contract: Public Careers (`/api/public/careers/:org`) — no authentication, IP rate-limited

| Method & path | Notes |
|---|---|
| GET `/postings` | `[{id, title, description, department, openings}]` (OPEN only) |
| GET `/postings/:id` | 404 unless OPEN |
| GET `/challenge` | `{challenge, nonce, bits, minFillMs}` — find `solution` with sha256(`nonce:solution`) having `bits` leading zero bits |
| POST `/postings/:id/applications` | multipart `name, email, phone?, challenge, solution, website (empty), file (PDF/DOCX)` → 201 `{applicationId, reference, posting, message}`; 400 `BOT_CHECK_FAILED`, 409 `DUPLICATE_APPLICATION` / `POSTING_NOT_OPEN`, 413/415 |
| POST `/status` | `{email, reference}` → `{posting, status, final, appliedAt}`; generic 404 `NO_MATCH` |

Related changes:
- `POST/PATCH /api/recruitment/postings` accept `description`.
- `DELETE /api/recruitment/candidates/:id` (Admin/HR) → 204, removing applications, interviews,
  documents and files.
