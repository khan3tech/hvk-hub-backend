---

description: "Task list for Authentication & Role-Based Access"
---

# Tasks: Authentication & Role-Based Access

**Input**: Design documents from `/specs/001-auth-rbac/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auth-api.md, quickstart.md

**Tests**: Not explicitly requested in the feature specification — no dedicated test-writing
tasks are included. `quickstart.md`'s scenarios serve as the manual/automated acceptance
validation at the end of each story.

**Organization**: Tasks are grouped by user story (spec.md: US1, US2, US3 — priorities P1, P2,
P1) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- File paths are exact, relative to repo root

## Path Conventions

Web app layout already scaffolded in this repo: `apps/api/src/...` (backend), `apps/web/...`
(frontend). See plan.md § Project Structure for the full existing-file map.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and config needed before any auth code is written. Most of this
already exists in the repo — verify, don't recreate.

- [X] T001 Verify `apps/api/package.json` has `bcrypt`, `jsonwebtoken`, `zod`,
  `express-rate-limit`, `cookie-parser` as dependencies (already present per plan.md Technical
  Context) — add only if actually missing.
- [X] T002 [P] Add `Vitest` + `@testing-library/react` + `@testing-library/jest-dom` as
  devDependencies to `apps/web/package.json` and a `"test": "vitest run"` script (research.md
  R4 — `apps/api` already has this, `apps/web` does not).
- [X] T003 [P] Add environment variables `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and
  `AUTH_LOCKOUT_THRESHOLD` (default `3`, research.md R2, corrected 2026-09-14 from an earlier
  default of 5 per spec Clarifications) to `apps/api/.env.example`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, core auth libs, and middleware that every user story below depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Add `failedLoginAttempts Int @default(0)` and `lockedAt DateTime?` fields to the
  `User` model in `apps/api/prisma/schema.prisma`, per data-model.md § User (modified) — exact
  field names and types as specified there.
- [X] T005 Add the new `RefreshToken` model to `apps/api/prisma/schema.prisma` per data-model.md
  § RefreshToken (new model): fields `id`, `orgId`, `userId`, `user` relation, `tokenHash`,
  `expiresAt`, `revokedAt`, `createdAt`; indexes `@@index([userId])` and `@@index([tokenHash])`.
  Add the inverse `refreshTokens RefreshToken[]` relation on `User`.
- [X] T006 Run `npm run --workspace apps/api prisma:migrate` to generate and apply the migration
  for T004/T005. Applied as migration `20260913173351_add_auth_lockout_and_refresh_token`
  against a locally running `docker-compose` Postgres. Required creating `apps/api/.env` (from
  `.env.example` — it didn't exist yet) and clearing a stale advisory-lock-holding connection
  left by an earlier interactively-hung `prisma migrate dev` run.
- [X] T007 [P] Implement `signAccessToken`, `signRefreshToken`, `verifyToken` fully in
  `apps/api/src/lib/jwt.ts` (stub already declares the TTL constants and signatures) — access
  token payload is `{ sub, role, employeeId }`, 15 min TTL; refresh token payload is `{ sub }`,
  7 day TTL, per constitution Principle III and plan.md Constraints.
- [X] T008 [P] Add a `hashToken(raw: string): string` helper (sha256) to `apps/api/src/lib/jwt.ts`
  or a new `apps/api/src/lib/token-hash.ts` — used to store/lookup `RefreshToken.tokenHash`
  without ever persisting the raw token (data-model.md § RefreshToken validation rules).
- [X] T009 [P] Add a `PERMISSIONS` matrix constant to `apps/api/src/lib/roles.ts` encoding the
  RBAC matrix from spec.md § Assumptions (role-only checks; per-module "my team"/"my department"
  scope checks stay in each module's service.ts — research.md R5, constitution Principle III).
- [X] T010 Implement `authenticate` middleware in `apps/api/src/middleware/authenticate.ts`:
  verify `Authorization: Bearer <token>` using `verifyToken` (T007), attach
  `req.user: { id, role, employeeId }`, call `next()` on success, or respond 401
  `{ error: { code: "UNAUTHENTICATED", message } }` on missing/invalid/expired token
  (contracts/auth-api.md § Middleware contract). Extended beyond the original task description
  with a cookie-based fallback (see tasks.md Notes) so Next.js Server Components can resolve
  the current user without an in-memory access token, and with an offboarded-employee check.
- [X] T011 Implement `authorize(...roles: Role[])` middleware in
  `apps/api/src/middleware/authorize.ts`: 403 `{ error: { code: "FORBIDDEN", message } }` if
  `req.user.role` is not in the allowed list, else `next()` (contracts/auth-api.md § Middleware
  contract; role-only — no scope logic here per Principle III).
- [X] T012 Configure `express-rate-limit` on `POST /auth/login` specifically (keyed by
  `email + IP`, in-memory store) in `apps/api/src/modules/auth/routes.ts` setup, per research.md
  R3 — not applied blanket across all of `/auth/*`.

**Checkpoint**: Schema migrated, JWT signing/verification works, RBAC middleware is callable by
any module. User story implementation can now begin.

---

## Phase 3: User Story 1 - Sign in and reach a role-appropriate home screen (Priority: P1) 🎯 MVP

**Goal**: A user can sign in with email/password and land on a dashboard showing only their
role's permitted sections; invalid credentials are rejected with a generic message.

**Independent Test**: Sign in as each of the four seeded roles and confirm each sees a
different, role-appropriate navigation set (quickstart.md Scenario 1).

### Implementation for User Story 1

- [X] T013 [US1] Extend `apps/api/src/modules/auth/schema.ts` if needed — `LoginRequestSchema`,
  `AuthUserSchema`, `LoginResponseSchema` already exist and match contracts/auth-api.md § POST
  /auth/login; verify field names/types match data-model.md exactly (`email` valid format,
  `password` min 8 chars).
- [X] T014 [US1] Implement `apps/api/src/modules/auth/repository.ts`: `findUserByEmail(orgId,
  email)` (case-insensitive, scoped `[orgId, email]` per data-model.md § User validation
  rules), `incrementFailedAttempts(userId)`, `resetFailedAttempts(userId)`,
  `lockUser(userId)`, `createRefreshToken(userId, tokenHash, expiresAt)` — Prisma queries only,
  per constitution Principle I (no other module imports this file).
- [X] T015 [US1] Implement login logic in `apps/api/src/modules/auth/service.ts`: look up user
  by email (T014), reject with generic `INVALID_CREDENTIALS` if not found or password mismatch
  (bcrypt compare, cost 12) — same message/code for both cases (spec FR-001, Edge Cases); if
  `User.lockedAt IS NOT NULL`, reject with 403 `ACCOUNT_LOCKED` instead (contracts/auth-api.md);
  on success, reset `failedLoginAttempts` to 0, issue access token (T007) + create `RefreshToken`
  row (T008, T014).
- [X] T016 [US1] Implement `apps/api/src/modules/auth/controller.ts` `login` handler: validate
  request body against `LoginRequestSchema`, call service (T015), set the httpOnly
  `refreshToken` cookie (`HttpOnly; Secure; SameSite=Strict; Path=/auth`, 7 day expiry), return
  `LoginResponseSchema` JSON body (contracts/auth-api.md § POST /auth/login).
- [X] T017 [US1] Wire `POST /auth/login` in `apps/api/src/modules/auth/routes.ts`: apply the
  rate limiter (T012), `validate` middleware with `LoginRequestSchema`, then `controller.login`;
  register the path with `registry.registerPath(...)` in `apps/api/src/lib/openapi.ts` per
  constitution's OpenAPI requirement. Also mounted `authRouter` at `/api/auth` in `app.ts`
  (was a TODO comment, no module was mounted yet) and fixed a real
  `zod-to-openapi` bug found while verifying this: `extendZodWithOpenApi(z)` was never called,
  so any route with path params would throw at document-generation time — fixed in
  `lib/openapi.ts`, benefits every future module's routes.ts too.
- [X] T018 [US1] Implement `GET /auth/me` end-to-end (routes → controller → service →
  repository) in the auth module: `authenticate` middleware (T010) required, returns
  `AuthUserSchema` for `req.user` (contracts/auth-api.md § GET /auth/me).
- [X] T019 [US1] Write `ActivityLog` row (`action: "auth.sign_in"`, `entity: "User"`) in the same
  service-layer call as a successful login (T015), per FR-009 and constitution Principle IV
  (same transaction as the state change). Skips the write (rather than crashing) when the
  actor has no linked Employee record — see data-model.md's flagged gap on
  `ActivityLog.actorId` requiring an Employee id.
- [X] T020 [US1] Implement `apps/web/lib/api-client.ts` `apiRequest<T>()`: attach
  `Authorization: Bearer <accessToken>` from in-memory state, parse the standard
  `{ error: { code, message, fields? } }` shape into `ApiClientError`, call `POST /auth/refresh`
  once on a 401 and retry, else redirect to `/login` (stub TODO in the file).
- [X] T021 [US1] Implement `apps/web/app/(auth)/login/page.tsx`: `react-hook-form` +
  `zodResolver` using a client-local copy of `LoginRequestSchema`'s shape, calls
  `POST /auth/login` via `apiRequest`, shows the generic invalid-credentials message on 401 and
  a distinct "account locked" message on 403 `ACCOUNT_LOCKED` (spec Edge Cases), redirects to
  `/dashboard` on success. Later restyled (2026-09-14, "implement UI" pass) with shadcn/ui +
  Tailwind — see T022's note for what that entailed and what it fixed.
- [X] T022 [US1] Implement `apps/web/app/(app)/layout.tsx`: Server Component that calls
  `GET /auth/me` server-side, wraps children in `AuthProvider` (existing `auth-context.tsx`),
  and renders nav items filtered by `user.role` against the same RBAC matrix used in T009 (own
  `apps/web` copy per constitution Principle II — no shared package). Required extending
  `authenticate` (T010) with a refreshToken-cookie fallback since a Server Component has no
  in-memory Bearer access token to send — see tasks.md Notes.
- [ ] T023 [US1] **BLOCKED on T006** — Run quickstart.md Scenario 1 end-to-end (all four seeded
  roles) and confirm SC-001 (dashboard renders within 5s) and SC-004 (clear, non-technical
  refusal messages). Requires a migrated database and seed data (prisma/seed.ts is still an
  empty stub — seeding users per role is itself unimplemented). Verified instead via: full
  typecheck of both apps (clean), the 8 backend + 3 frontend automated tests (all passing),
  and a standalone script confirming all 5 `/auth/*` routes register correctly in the OpenAPI
  document.

**Checkpoint**: User Story 1 fully functional — sign-in, role-scoped nav, generic error
messages. This is the MVP; it can be demoed independently.

---

## Phase 4: User Story 2 - Stay signed in across a normal workday (Priority: P2)

**Goal**: A user's session renews transparently within the 7-day window; after 7 days of
inactivity they're redirected to sign in again.

**Independent Test**: Sign in, wait past the 15-minute access-token window, perform an action —
it succeeds without an extra sign-in (quickstart.md Scenario 2).

### Implementation for User Story 2

- [X] T024 [US2] Implement `refreshToken` logic in `apps/api/src/modules/auth/service.ts`: look
  up `RefreshToken` by `hashToken(cookie value)` (T008), reject 401 `INVALID_SESSION` if not
  found, `revokedAt IS NOT NULL`, or `expiresAt <= now()`; else rotate — revoke the old row, sign
  and store a new `RefreshToken`, sign a fresh 15-min access token (contracts/auth-api.md § POST
  /auth/refresh).
- [X] T025 [US2] Wire `POST /auth/refresh` in `routes.ts` → `controller.ts` (reads the
  `refreshToken` cookie, calls T024, re-sets the rotated cookie, returns
  `RefreshResponseSchema` `{ accessToken }`) → register in OpenAPI.
- [X] T026 [US2] Add `RefreshResponseSchema = z.object({ accessToken: z.string() })` to
  `apps/api/src/modules/auth/schema.ts` (contracts/auth-api.md § Schema additions needed).
- [X] T027 [US2] Implement `logout` in service/controller/routes: revoke the presented
  `RefreshToken` row (`revokedAt = now()`), clear the cookie, return 204 (contracts/auth-api.md §
  POST /auth/logout, FR-003 "immediately invalidate").
- [X] T028 [US2] In `apps/web/lib/api-client.ts`, complete the 401 → `POST /auth/refresh` →
  retry-once → on second failure, clear local auth state and redirect to `/login` flow (extends
  T020 with the concrete refresh call now that T025 exists).
- [X] T029 [US2] Confirm `apps/web/middleware.ts`'s existing `refreshToken` cookie check requires
  no changes (it already gates on cookie presence, not content) — verify behavior against a
  7-day-expired cookie redirects to `/login` (quickstart.md Scenario 2 step 4/5). Confirmed by
  inspection: the middleware only checks cookie presence, and an expired cookie is not sent by
  the browser at all, so the existing redirect-to-/login branch already covers this case with
  no code change needed.
- [ ] T030 [US2] **BLOCKED on T006** — Run quickstart.md Scenario 2 end-to-end and confirm SC-003
  (no forced sign-out within a continuous 8-hour session). Needs a live database; see T023.

**Checkpoint**: User Stories 1 AND 2 both work independently — sign-in plus transparent session
renewal.

---

## Phase 5: User Story 3 - Be blocked from actions and data outside one's role (Priority: P1)

**Goal**: Employees, Managers, and HR/Admin are each restricted to their RBAC-defined scope;
attempts outside that scope are refused with a clear message. Includes account lockout
(FR-011/FR-012) and offboarding revocation (FR-010) as they are part of this story's security
backbone.

**Independent Test**: Attempt each restricted action as a role that shouldn't be allowed to
perform it and confirm refusal (quickstart.md Scenarios 3, 4, 5).

### Implementation for User Story 3

- [X] T031 [US3] Increment `failedLoginAttempts` on every failed login in
  `apps/api/src/modules/auth/service.ts` (extends T015); when it reaches
  `AUTH_LOCKOUT_THRESHOLD` (T003, default 3), set `lockedAt = now()` — no automatic unlock
  (spec Clarifications, FR-011). Verified end-to-end against the live dev API + seeded Postgres
  (quickstart.md Scenario 4, corrected step counts): 3 consecutive wrong-password attempts lock
  the account, and a 4th attempt with the *correct* password still returns 403 `ACCOUNT_LOCKED`.
- [X] T032 [US3] Add `UnlockResponseSchema = z.object({ id: z.string(), lockedAt: z.null() })`
  to `apps/api/src/modules/auth/schema.ts` (contracts/auth-api.md § Schema additions needed).
- [X] T033 [US3] Implement `unlockUser(userId)` in service.ts: reset `failedLoginAttempts` to 0
  and `lockedAt` to null, revoke all of that user's active `RefreshToken` rows is NOT required
  here (unlock ≠ forced logout), and write an `ActivityLog` row (`action:
  "auth.account_unlocked"`, `actorId` = calling Admin/HR's Employee id, `before: { lockedAt }`,
  `after: { lockedAt: null }`) in the same transaction (FR-012, data-model.md § ActivityLog).
- [X] T034 [US3] Wire `POST /auth/:userId/unlock` in routes.ts with `authenticate` (T010) +
  `authorize("ADMIN", "HR")` (T011) applied, → controller → service (T033); 404 `NOT_FOUND` if
  `userId` doesn't exist in caller's org (contracts/auth-api.md § POST /auth/:userId/unlock) →
  register in OpenAPI.
- [X] T035a [US3] Update `apps/api/.env` and `apps/api/.env.example`'s `AUTH_LOCKOUT_THRESHOLD`
  from `5` to `3` (spec Clarifications 2026-09-14, research.md R2) — the values were set before
  the clarification landed and were never corrected. Also corrected the in-code default
  (`Number(process.env.AUTH_LOCKOUT_THRESHOLD ?? 3)` in `service.ts`) and the test suite's stub
  env var, which both still said `5`.
- [X] T035b [US1] Implement FR-013 (single active session per user, spec Clarifications
  2026-09-14, research.md R6): in the login path of `apps/api/src/modules/auth/service.ts`
  (T015), before creating the new `RefreshToken` row, revoke all of that user's existing
  non-revoked `RefreshToken` rows (`revokedAt = now()`) so a new sign-in on another
  device/browser ends the previous session (contracts/auth-api.md § POST /auth/login side
  effects, data-model.md § RefreshToken validation rules). Reused the existing
  `repo.revokeAllRefreshTokensForUser(userId)` helper (already built for T035's offboarding
  revocation) rather than adding a new one. Added a unit test verifying it's called on every
  successful login. Verified end-to-end against the live dev API + seeded Postgres (quickstart.md
  Scenario 6): Device A's refresh token stops working (401 `INVALID_SESSION`) immediately after
  Device B signs in as the same user, while Device B's own session stays valid.
  **Bug found and fixed while verifying this end-to-end** (pre-existing, not introduced by
  T035b, but blocking): `apps/api/src/modules/auth/controller.ts`'s refresh-cookie `path` was
  hardcoded to `/auth`, but `app.ts` mounts the auth router at `/api/auth` — so the browser
  would never actually send the cookie back on `/api/auth/refresh` or `/api/auth/logout`
  requests. Fixed both `res.cookie(...)` calls and the `res.clearCookie(...)` call in
  `controller.ts` to use `path: "/api/auth"`, matching where the router is actually mounted and
  what `apps/web/lib/api-client.ts`'s `API_BASE` (`.../api`) + relative `/auth/...` paths
  actually resolve to. Without this fix, session refresh and logout would have silently never
  worked through a real browser despite all existing unit/component tests passing (they don't
  exercise cookie `Path` scoping).
- [X] T035 [US3] Implement offboarding revocation: when `Employee.status` is set to
  `OFFBOARDED` (called from 002's employee-management service, or directly for this feature's
  own testing), revoke all of that Employee's linked `User`'s active `RefreshToken` rows
  (FR-010) — expose this as an exported function from `apps/api/src/modules/auth/service.ts`
  (e.g. `revokeAllSessionsForUser(userId)`) so module 002 can call it without reaching into
  auth's repository directly (constitution Principle I). Not yet wired to a caller since 002
  doesn't exist yet — `revokeAllSessionsForUser` is exported and ready for 002 to call once its
  own /speckit-plan lands.
- [X] T036 [US3] In `authenticate` middleware (T010), after verifying the JWT, treat a request
  from a user whose linked `Employee.status = OFFBOARDED` as unauthenticated (401) even if the
  access token itself hasn't expired yet — the 15-minute window is the accepted exposure cap
  per research.md R1, but an explicit offboarded-employee check closes it faster when the data
  is already being read for `req.user`.
- [ ] T037 [US3] **DEFERRED** — Implement role/scope enforcement helpers in each existing
  module's `service.ts` (attendance/employee/payroll/recruitment). These modules' service.ts
  files are still empty `export {}` stubs — specs 002-005 haven't been through `/speckit-plan`
  yet, so there is no business logic to attach a scope check to. Doing this now would mean
  writing 002-005's service layers ad hoc inside the 001 feature, which isn't this feature's
  scope. Revisit once each module's own plan/tasks exist.
- [ ] T038 [US3] **DEFERRED** — same reason as T037: the route stubs
  (`apps/api/src/modules/{attendance,employee,payroll,recruitment}/routes.ts`) declare no
  endpoints yet to attach `authorize(...)` to.
- [X] T039 [US3] Standardize the 403 refusal response across all of the above to
  `{ error: { code: "FORBIDDEN", message } }` with a clear, non-technical `message` (SC-004) —
  verified: `authorize()` (T011) and the central `errorHandler.ts`'s `DomainError` path both
  already produce this exact shape, so any future module reusing `authorize`/`DomainError`
  gets this for free without hand-rolling it.
- [ ] T040 [US3] **BLOCKED on T006** — Run quickstart.md Scenarios 3, 4, and 5 end-to-end and
  confirm SC-002. Scenario 3 also partially blocked on T037/T038 (no other module's RBAC is
  wired yet to test against) — the unlock-flow portion (Scenario 4) and offboarding-revocation
  portion (Scenario 5) are implemented and covered by the automated unit tests, but not yet
  runnable end-to-end without a database.

**Checkpoint**: All three user stories independently functional — sign-in, session persistence,
and full RBAC enforcement including lockout and offboarding revocation.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that span all three stories.

- [X] T041 [P] Add Vitest unit tests for `apps/api/src/modules/auth/service.ts` covering: wrong
  password, nonexistent email (identical error), locked account, lockout threshold trigger,
  successful unlock, refresh token rotation, offboarded-user session revocation. 8 tests added
  in `service.test.ts` (repository mocked — no live DB needed), all passing. Refresh-token
  rotation itself is exercised indirectly through the service's `issueSession` path; a
  dedicated `refresh()`/`logout()` test suite would strengthen this further but wasn't required
  to unblock T023/T030/T040's blockers.
- [X] T042 [P] Add Vitest + React Testing Library tests for `apps/web/app/(auth)/login/page.tsx`
  covering the generic-error and account-locked UI states (T002 sets up the tooling). 3 tests
  added, all passing; also added `vitest.config.ts`/`vitest.setup.ts` to `apps/web` (not
  pre-existing) since none existed yet.
- [X] T043 [P] Confirm every `/auth/*` endpoint appears in the generated OpenAPI document and is
  browsable via Swagger UI in dev (constitution Development Workflow § API documentation).
  Verified via a standalone script: all 5 paths (`/auth/login`, `/auth/refresh`,
  `/auth/logout`, `/auth/me`, `/auth/{userId}/unlock`) generate correctly. This surfaced and
  fixed a real bug (see T017 note): `extendZodWithOpenApi(z)` was never called anywhere in the
  repo, so `registerPath` calls with path/query params would throw — first hit by this
  feature's `unlock` endpoint since it's the first route in the repo to declare params.
- [X] T044 Verify Helmet defaults and the CORS allowlist (constitution Principle III) are applied
  globally in `apps/api/src/app.ts`, not just on the auth module. Confirmed by inspection:
  `helmet()` and the CORS allowlist middleware are both registered before any route (including
  the newly-mounted `/api/auth`), so they apply repo-wide by construction, no change needed.
- [ ] T045 **BLOCKED on T006** — Run full `quickstart.md` checklist end-to-end (all 5 scenarios,
  all 4 success criteria) as final acceptance validation. Requires a live, migrated,
  seeded database. See "What's left" note below.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only. This is the MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational; T028 also depends on US1's T020/T021
  (extends the login page's error handling and the api-client stub) — implement after US1.
- **User Story 3 (Phase 5)**: Depends on Foundational; T036 depends on US1's T010/T018 (extends
  `authenticate` and needs `GET /auth/me` working to verify); best implemented after US1, and
  can proceed in parallel with US2 since they touch different files (refresh/logout vs.
  lockout/RBAC-per-module).
- **Polish (Phase 6)**: Depends on all three stories being complete.

### Within Each User Story

- Repository → Service → Controller → Routes (each depends on the previous within the same
  story).
- Backend endpoint before the frontend page/component that calls it.

### Parallel Opportunities

- T002/T003 (Setup) in parallel.
- T007/T008/T009 (Foundational — different files) in parallel; T010/T011 depend on T007.
- Within US1: T013 can run alongside T007-T012 finishing; T020 (frontend) can start once T016's
  response shape is settled, in parallel with T017-T019 (backend wiring).
- US2 and US3 can be worked on in parallel by different people once US1's Phase 3 checkpoint is
  reached, since they touch different files (auth/service.ts refresh/logout logic vs. lockout +
  other modules' routes.ts/service.ts).
- T041/T042/T043 (Polish) in parallel.

---

## Parallel Example: Foundational Phase

```bash
# After T004-T006 (schema/migration) complete, these can run together:
Task: "Implement signAccessToken/signRefreshToken/verifyToken in apps/api/src/lib/jwt.ts"
Task: "Add hashToken helper to apps/api/src/lib/jwt.ts or lib/token-hash.ts"
Task: "Add PERMISSIONS matrix constant to apps/api/src/lib/roles.ts"
```

## Parallel Example: User Story 1

```bash
Task: "Implement apps/api/src/modules/auth/repository.ts (findUserByEmail, etc.)"
# then, once repository.ts exists:
Task: "Implement login logic in apps/api/src/modules/auth/service.ts"
# in parallel with backend wiring, once LoginResponseSchema shape is confirmed:
Task: "Implement apps/web/lib/api-client.ts apiRequest()"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (schema migration, JWT lib, RBAC middleware) — CRITICAL,
   blocks everything else.
3. Complete Phase 3: User Story 1 (sign-in + role-scoped dashboard).
4. **STOP and VALIDATE**: run quickstart.md Scenario 1, confirm SC-001/SC-004.
5. Demo: a user can sign in and see a role-appropriate dashboard. Every other TeamLoom module
   still needs Phase 5 (RBAC enforcement) before they can safely go live, but the auth gate
   itself is demoable here.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. User Story 1 → validate → demo (MVP).
3. User Story 3 next (also P1 — it's the security backbone; don't ship US1 broadly without it)
   → validate → demo.
4. User Story 2 → validate → demo.
5. Polish.

### Parallel Team Strategy

With multiple developers, after Foundational completes:
- Developer A: User Story 1 (sign-in flow, both apps).
- Developer B: User Story 3's lockout/unlock pieces (T031-T034) — independent of US1's UI work
  once the schema (T004) exists.
- Developer C: User Story 2's refresh/logout (T024-T027) — independent of US1's UI work.
- Converge for T037-T040 (per-module RBAC wiring) once US1's `authenticate`/`authorize` are
  proven working.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- US1 and US3 are both P1 — spec.md treats them as equally critical (sign-in and RBAC
  enforcement are "the security backbone", not sequential nice-to-haves), so don't treat US1 as
  "done" for production readiness until US3 also lands, even though US1 alone is independently
  demoable.
- Verify each task's file exists as a stub already (see plan.md § Project Structure) before
  assuming it needs to be created from scratch — most files in this feature are "implement",
  not "create".
- Commit after each task or logical group.
- Stop at any checkpoint to validate a story independently via quickstart.md.

## What's left (2026-09-13 implementation pass)

39 of 45 tasks complete (T001-T005, T007-T036, T039, T041-T044). Both apps typecheck cleanly
(one pre-existing, unrelated `pino-http` type error in `app.ts` was left as-is — it predates
this feature and isn't part of any task here) and all 11 automated tests (8 backend + 3
frontend) pass.

**Update 2026-09-14 — database unblocked**: Postgres was brought up via `docker-compose up -d
postgres`, T006's migration applied, and `prisma/seed.ts` (previously an empty stub) now seeds
one User+Employee per role (`admin@teamloom.dev`, `hr@teamloom.dev`, `manager@teamloom.dev`,
`employee@teamloom.dev`, all password `Password123!`, employee reports to manager) so the
quickstart.md scenarios are actually runnable. T023/T030/T040/T045 (end-to-end quickstart
validation) are unblocked but still not formally run/checked off — they need a person clicking
through the browser, not just curl-level verification.

**Update 2026-09-14 — UI implementation pass** ("implement UI, feature by feature, alongside
each API" — user's explicit direction, not a pre-built design system per spec.md/plan.md's
Simplicity & YAGNI principle): shadcn/ui was initialized in `apps/web` (`components.json`,
`lib/utils.ts`) with a Material-admin-inspired indigo/teal palette (not a copy of any specific
paid theme — see conversation for why). Built for 001's actual scope only: `login/page.tsx`
restyled with Card/Alert/Button, `(app)/layout.tsx` given a real sidebar (`components/shell/
sidebar-nav.tsx`) and topbar with user menu (`components/shell/topbar.tsx`), and `dashboard/
page.tsx` given a role-aware welcome + placeholder stat cards (explicitly marked as
placeholders — real numbers arrive with 002-005). Two real bugs found and fixed while getting
this working, not part of any task above:
- shadcn's CLI (current version) scaffolds Tailwind v4 syntax (`@theme inline` in
  `globals.css`) by default; this repo is pinned to Tailwind v3 (constitution Technology
  Stack) and errored on load (`border-border` undefined). Fixed by hand-wiring the CSS custom
  properties into `tailwind.config.ts`'s `theme.extend.colors` (classic shadcn-for-v3 pattern)
  instead of the generated v4 CSS-only approach — `components.json`/`globals.css`/
  `tailwind.config.ts` now need to be maintained manually on future `shadcn add` runs, not
  trusted as-generated.
  - Also fixed: `Geist` (assumed by the CLI) doesn't exist in the installed Next.js 14.2.5's
    `next/font/google` — swapped for `Inter` in `app/layout.tsx`.
- A new `components/ui/form-input.tsx` (`FormInput`/`FormLabel`) was added for
  react-hook-form-registered fields, after diagnosing (incorrectly, initially — see
  conversation) a "refs not forwarding" failure. The actual bug was in my own first draft of
  `FormInput`: it wasn't wrapped in `React.forwardRef`, so `register()`'s ref silently
  dropped and no keystroke ever reached react-hook-form. Fixed by adding `forwardRef`; shadcn's
  generated `Input` (`@base-ui/react`-backed) was never actually broken. Kept `FormInput` as
  the dedicated form-field primitive going forward since it's simpler (no Field-context
  dependency) — use it for any future `register()`-driven field; the shadcn `Input` remains
  fine for non-form uses.

**Deferred, not blocked** — genuinely out of this feature's scope:
- T037, T038 — wiring RBAC scope checks into attendance/employee/payroll/recruitment. Those
  modules' `service.ts`/`routes.ts` are empty stubs; specs 002-005 haven't been through
  `/speckit-plan` yet, so there's no business logic yet to attach a scope check to.

**Next steps**: click through quickstart.md's 5 original scenarios in a real browser to formally
close out T023/T030/T040/T045. Revisit T037/T038 once 002-005 have their own plans — their own
`/speckit-plan` passes should each include their own UI-implementation task, following the
same "one feature's UI at a time" approach used here.

**Update 2026-09-14 — reconciling two post-implementation spec clarifications**: `/speckit-clarify`
added two clarifications after this feature's initial implementation pass had already shipped
code against the old (unclarified) assumptions: the lockout threshold, previously an
undifferentiated "5" default, is now fixed at 3 (FR-011); and sessions, previously unbounded in
number per user, must now be single-active-only (new FR-013). New tasks T035a/T035b close this
gap: `AUTH_LOCKOUT_THRESHOLD` corrected to 3 everywhere (`.env`, `.env.example`, `service.ts`'s
in-code default, `service.test.ts`'s stub), and `login()` now revokes all of a user's other
non-revoked `RefreshToken` rows before issuing a new one (FR-013), reusing the
`revokeAllRefreshTokensForUser` helper T035 already built for offboarding. Both behaviors were
verified against the live dev API and seeded Postgres, not just unit tests (see T031, T035b
notes) — this end-to-end pass also caught and fixed a real, pre-existing, unrelated bug: the
refresh-cookie's `path` was hardcoded to `/auth` while the router is mounted at `/api/auth` in
`app.ts`, so refresh/logout would have silently never worked through an actual browser. All 9
backend tests (was 8) and 3 frontend tests still pass; `research.md`, `data-model.md`,
`contracts/auth-api.md`, and `quickstart.md` were updated during the preceding `/speckit-plan`
pass to describe this behavior — this implementation pass is what made the code match them.
