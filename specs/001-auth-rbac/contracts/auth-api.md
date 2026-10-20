# Contract: Auth API (`/auth/*`)

Per constitution Technology Stack, the canonical machine-readable contract is the OpenAPI
document generated at runtime from each endpoint's `zod` schema, registered in
`apps/api/src/lib/openapi.ts` via `registry.registerPath(...)` from `modules/auth/routes.ts`,
and served via Swagger UI in non-production environments. This file is the human-readable
source `/speckit-tasks` and `/speckit-implement` build that registration from — not a second,
competing source of truth.

All request/response schemas below extend `modules/auth/schema.ts` (`LoginRequestSchema`,
`AuthUserSchema`, `LoginResponseSchema` already exist; new schemas needed are marked **NEW**).

Every error response uses the constitution's standard shape:
`{ error: { code, message, fields? } }`.

---

## POST /auth/login

**Role required**: none (public — this is how you become authenticated).

**Request** (`LoginRequestSchema`, exists):
```json
{ "email": "user@example.com", "password": "string, min 8 chars" }
```

**Response 200** (`LoginResponseSchema`, exists — response body unchanged; refresh token now
delivered as an httpOnly cookie, not in the JSON body):
```json
{ "accessToken": "jwt", "user": { "id": "...", "email": "...", "role": "ADMIN|HR|MANAGER|EMPLOYEE", "employeeId": "..." } }
```
Also sets `Set-Cookie: refreshToken=<opaque>; HttpOnly; Secure; SameSite=Strict; Path=/auth`.

**Errors**:
| Status | code | When |
|---|---|---|
| 401 | `INVALID_CREDENTIALS` | Wrong password, or email doesn't exist (identical message/code either way — FR-001, Edge Cases) |
| 403 | `ACCOUNT_LOCKED` | `User.lockedAt IS NOT NULL` (spec Edge Cases: distinct message from invalid-credentials) |
| 429 | `RATE_LIMITED` | Too many attempts in the rate-limit window (FR-011, R3) |

**Side effects**: on failure, increments `failedLoginAttempts`; at threshold (3), sets `lockedAt`
and does NOT auto-notify (out of scope). On success: resets `failedLoginAttempts` to 0, writes
`ActivityLog` row (`action: "auth.sign_in"`, FR-009), revokes all of the user's existing
non-revoked `RefreshToken` rows (FR-013 — single active session, ends any previous device's
session), then issues access JWT + creates a new `RefreshToken` row.

---

## POST /auth/refresh

**Role required**: none (authenticated via the refresh cookie itself, not a Bearer token).

**Request**: no body — reads `refreshToken` httpOnly cookie.

**Response 200**: `{ "accessToken": "jwt" }` — a fresh 15-minute access token. Rotates the
refresh token (revokes the old `RefreshToken` row, issues + stores a new one, re-sets the
cookie) to limit replay window.

**Errors**:
| Status | code | When |
|---|---|---|
| 401 | `INVALID_SESSION` | Cookie missing, expired, or `RefreshToken.revokedAt IS NOT NULL` |
| 403 | `ACCOUNT_LOCKED` | User was locked after the refresh token was issued |

---

## POST /auth/logout

**Role required**: any authenticated user.

**Request**: no body — reads `refreshToken` cookie and `Authorization: Bearer <accessToken>`.

**Response 204**: no content. Sets `RefreshToken.revokedAt = now()` for the presented token
(FR-003 — immediate invalidation) and clears the cookie.

---

## GET /auth/me

**Role required**: any authenticated user.

**Response 200** (`AuthUserSchema`, exists): the current user's `id`, `email`, `role`,
`employeeId`. This is what `apps/web`'s `AuthProvider` hydrates from — components never decode
the JWT client-side (per `auth-context.tsx` comment).

**Errors**: 401 `UNAUTHENTICATED` if the access token is missing/invalid/expired (client is
expected to call `/auth/refresh` first — see `api-client.ts`'s stubbed 401→refresh→retry flow).

---

## POST /auth/:userId/unlock **(NEW)**

**Role required**: `ADMIN`, `HR` (FR-012).

**Request**: no body.

**Response 200**: `{ "id": "...", "lockedAt": null }` — the updated user (or a subset; exact
shape decided at `/speckit-tasks`).

**Side effects**: sets `failedLoginAttempts = 0`, `lockedAt = null`; writes `ActivityLog` row
(`action: "auth.account_unlocked"`, `actorId` = the calling Admin/HR's Employee id — see
data-model.md's open point about Admin/HR users with no linked Employee record).

**Errors**:
| Status | code | When |
|---|---|---|
| 403 | `FORBIDDEN` | Caller is not ADMIN/HR |
| 404 | `NOT_FOUND` | `userId` doesn't exist in caller's org |
| 409 | `NOT_LOCKED` | Target user is not currently locked (optional — or this could be a no-op 200; decide at `/speckit-tasks`) |

---

## Schema additions needed in `modules/auth/schema.ts`

New (not yet present):
- `UnlockResponseSchema` — `{ id: string, lockedAt: null }`.
- `RefreshResponseSchema` — `{ accessToken: string }`.

Existing, unchanged: `RoleSchema`, `LoginRequestSchema`, `AuthUserSchema`, `LoginResponseSchema`.

## Middleware contract (consumed by every other module)

- `authenticate(req, res, next)` — verifies `Authorization: Bearer <token>`, attaches
  `req.user: AuthUser` (id, role, employeeId), or calls `next(401 UNAUTHENTICATED)`.
- `authorize(...roles: Role[])` — returns middleware; 403 `FORBIDDEN` if `req.user.role` not in
  `roles`. Does NOT perform scope checks ("my team") — those belong in the calling module's
  `service.ts` per constitution Principle III and research.md R5.
