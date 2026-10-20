# Phase 0 Research: Authentication & Role-Based Access

## R1: Is `Session` a database table or a stateless JWT?

**Decision**: Hybrid. The **access token** stays a fully stateless JWT (15 min TTL, per
constitution) — no DB lookup on every authenticated request, keeping RBAC checks cheap. The
**refresh token** is backed by a `RefreshToken` row in Postgres (one row per issued refresh
token, hashed, with `revokedAt`).

**Rationale**: FR-003 requires sign-out to "immediately invalidate" the session, and FR-010
requires access revoked "immediately" on offboarding, and the new FR-011/012 lockout requires an
in-progress session to stop working the moment an account is locked. A pure stateless JWT cannot
satisfy any of these before natural expiry — there is nothing to revoke. Making the *access*
token stateful would add a DB round-trip to every single request in the system (every module
depends on this check), which conflicts with Principle VII (don't add cost that isn't needed).
Making only the long-lived *refresh* token stateful gives immediate revocation at the boundary
that matters (a revoked refresh token can't mint new access tokens) while capping the exposure
window of a compromised access token at 15 minutes — an accepted, explicit trade-off, not an
oversight.

**Alternatives considered**:
- Pure stateless (JWT only, no DB row) — rejected: cannot satisfy FR-003/FR-010/FR-012 without
  waiting up to 15 min for the access token to expire naturally.
- Stateful access token (DB lookup every request) — rejected: every other module's every request
  would pay a DB round-trip for RBAC; contradicts Principle VII and SC-001's 5s budget under load.
- Redis-backed revocation list — rejected: constitution Principle VII explicitly excludes Redis
  from v0.1; Postgres already holds `User`, no new infra needed for one small table.

**Resolves**: `docs/feature.md` § 001 TODO ("Session has no dedicated schema table — confirm
during 001's /speckit-plan").

## R2: Account lockout data shape

**Decision**: Add three fields to `User`: `failedLoginAttempts Int @default(0)`,
`lockedAt DateTime?`, and rely on existing `ActivityLog` for the unlock audit trail (no separate
lockout-history table). Lockout threshold: 3 consecutive failures (per spec Clarifications
2026-09-14), adjustable via env var, not hardcoded.

**Rationale**: FR-011/FR-012 (from spec Clarifications) need a boolean-ish "is this account
locked" state plus a counter to reach it; `lockedAt IS NOT NULL` doubles as both the lock flag
and the audit timestamp of when it happened, avoiding a redundant boolean column. Per
clarification, unlock is a manual Admin/HR action (not time-based), so no `lockoutExpiresAt`
field is needed.

**Alternatives considered**: A separate `LoginAttempt` table logging every attempt — rejected as
overkill for v0.1; FR-009's "who signed in, from where, when" is satisfied by logging successful
sign-ins only (via `pino` structured logs + `ActivityLog` for the unlock event itself), not by
persisting every failure.

## R3: Rate limiting implementation

**Decision**: `express-rate-limit` (already a dependency in `apps/api/package.json`), in-memory
store, keyed by `email + IP`, applied to `POST /auth/login` specifically (not all of `/auth/*`,
since `/auth/refresh` and `/auth/logout` need different limits and aren't credential-guessing
targets).

**Rationale**: Already installed; constitution Principle VII forbids adding Redis for v0.1, and
in-memory is sufficient for a single-instance deployment (no horizontal scaling of `apps/api` is
in scope per Technical Context Scale/Scope). This is the rate-limiting signal that feeds the
lockout counter in R2 — a distinct, softer control (slows brute force even before the hard
lockout threshold is reached).

**Alternatives considered**: Redis-backed rate-limit store — rejected per Principle VII until a
real multi-instance deployment need exists.

## R4: Testing framework

**Decision**: Vitest for `apps/api` (already configured — `"test": "vitest run"` in
`package.json`, `vitest` in devDependencies). `apps/web` has no test runner yet; this feature
adds Vitest + React Testing Library to `apps/web` for the login form and auth-context tests,
matching the backend's choice for consistency.

**Rationale**: Don't introduce a second test framework when one is already wired up and working
for the backend; Vitest's Next.js/React support via `@testing-library/react` is standard and
needs no additional infra.

**Alternatives considered**: Jest for `apps/web` — rejected, no reason to run two different test
runners across the two apps when Vitest already covers both ecosystems.

## R5: RBAC matrix as code

**Decision**: The RBAC matrix from spec.md's Assumptions is implemented as a static permission
table (`apps/api/src/lib/roles.ts` gains a `PERMISSIONS` map or equivalent) referenced by
`authorize()` at the route level for role-only checks, with scope checks ("my team", "my
department") implemented in each consuming module's `service.ts`, per constitution Principle III
("scoping ... only the service layer can evaluate correctly").

**Rationale**: Matches the existing stub comment in `authorize.ts` verbatim and avoids
duplicating scope logic in middleware, which cannot see reporting-line data without querying
Employee — exactly what Principle III forbids at the route level.

**Alternatives considered**: A generic policy engine (e.g., CASL) — rejected as unnecessary
abstraction for 4 fixed roles and a matrix that changes rarely (YAGNI, Principle VII).

## R6: Enforcing single active session per user

**Decision**: On successful login, before issuing a new `RefreshToken`, revoke all of that
user's existing non-revoked `RefreshToken` rows (`revokedAt = now()`). No schema change needed —
`RefreshToken` already stores one row per issued token (R1); this is a behavior added to
`POST /auth/login`'s side effects, not a new table or a `oneActiveSessionOnly` flag.

**Rationale**: Per spec Clarifications (2026-09-14), a user may have only one active session; a
new sign-in on another device must end the previous one. Revoking old refresh tokens at login
time achieves this without touching the access-token verification path (still stateless, no DB
hit) — the previous device's access token still works for up to 15 minutes until it naturally
expires, then its refresh attempt fails with `INVALID_SESSION` because its `RefreshToken` row is
now revoked. This 15-minute tail is an accepted trade-off, consistent with R1's reasoning for why
access-token revocation isn't instant.

**Alternatives considered**: A stateful access-token check (reject immediately, not just at
refresh) — rejected, same reasoning as R1: would add a DB round-trip to every authenticated
request across every module. A `currentSessionId` column on `User` instead of revoking rows —
rejected as a redundant second source of truth; "only one non-revoked `RefreshToken` row per
user" is already expressible as a query/side-effect rule on the existing table.
