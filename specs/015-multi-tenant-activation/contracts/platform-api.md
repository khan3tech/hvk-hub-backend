# Contract: Multi-tenancy & Platform API

## Changes to existing endpoints
- `POST /api/auth/login` accepts optional `organization` (slug). 400 `ORGANIZATION_REQUIRED`
  when the email exists in several orgs; 403 `ORGANIZATION_SUSPENDED` for a suspended org.
- Every authenticated endpoint acts in the org from the caller's token. Records of other orgs
  behave as non-existent (404, or 403 where a role gate applies first), and writes referencing
  them fail (400/404/409). A suspended org gets 403 `ORGANIZATION_SUSPENDED` on every call.
- `GET /api/auth/sso/start?organization=<slug>`.

## `/api/platform` (super-admin tier, separate bearer token)

| Method & path | Notes |
|---|---|
| POST `/auth/login` | `{email, password}` → `{accessToken, superAdmin}` (rate-limited; locks after 5 failures) |
| GET `/organizations` | `[{id, name, slug, status, createdAt, suspendedAt, usage{activeEmployees, users, lastActivityAt}}]` |
| POST `/organizations` | `{name, slug, adminName, adminEmail}` → 201 `{organization, admin{employeeId, email, temporaryPassword}}`; 409 `SLUG_TAKEN` |
| GET `/organizations/:id` | with usage |
| POST `/organizations/:id/suspend` · `/reactivate` | immediate |
