# Quickstart: Validate Authentication & Role-Based Access

Prerequisites: this feature implemented per plan.md/data-model.md/contracts/auth-api.md,
`apps/api` and `apps/web` both runnable, Postgres migrated and seeded.

## Setup

```bash
# from repo root
npm install
cp .env.example .env
npx prisma migrate deploy
npm run seed                            # creates at least one user per role (ADMIN/HR/MANAGER/EMPLOYEE)
npm run dev                             # API on :4000
node scripts/e2e-001-auth.mjs           # automated run of the API side of every scenario below
# apps/web (frontend repo): npm run dev  # UI checks (redirects, nav) live there
```

## Scenario 1 — Sign in and reach a role-appropriate dashboard (User Story 1, P1)

1. Open `apps/web`'s `/login`. Submit the seeded Manager's email + correct password.
2. **Expect**: redirected to `/dashboard`, nav shows only Manager-scoped sections (their team,
   not company-wide admin) — see spec Acceptance Scenario 1.4.
3. Submit the seeded Manager's email + a wrong password.
4. **Expect**: generic "invalid email or password" — same message as a nonexistent email (try
   `nobody@example.com` too, confirm identical response) — see contracts/auth-api.md `POST
   /auth/login` 401 `INVALID_CREDENTIALS`.

## Scenario 2 — Session persists across a normal workday (User Story 2, P2)

1. Sign in. Note the access token's 15-minute expiry (decode it, or wait).
2. After the access token has expired, perform any authenticated action (e.g., reload
   `/dashboard`).
3. **Expect**: the action succeeds transparently — `apps/web`'s `api-client.ts` calls `POST
   /auth/refresh` once and retries, no redirect to `/login`.
4. Manually clear the `refreshToken` cookie (simulating 7-day expiry) and repeat step 2.
5. **Expect**: redirected to `/login`.

## Scenario 3 — RBAC blocks out-of-scope actions (User Story 3, P1)

1. Sign in as the seeded Employee.
2. Attempt to fetch another employee's profile or payslip (via the UI or directly against the
   API).
3. **Expect**: refused — 403, per RBAC matrix in spec.md Assumptions.
4. Sign in as the seeded Manager. Attempt to approve a leave request for someone who is **not**
   their direct report (requires a second Manager + employee combination in seed data, or an
   `Employee.managerId` pointing elsewhere).
5. **Expect**: refused — 403.

## Scenario 4 — Account lockout (Clarifications, FR-011/FR-012)

1. Attempt sign-in with the seeded Employee's correct email and a wrong password 3 times
   (matching the configured threshold — see research.md R2).
2. **Expect**: 4th attempt (even with the *correct* password) returns 403 `ACCOUNT_LOCKED`, not
   the generic invalid-credentials message.
3. Sign in as the seeded Admin (or HR). Call `POST /auth/:userId/unlock` for the locked
   Employee.
4. **Expect**: 200, and the Employee can now sign in normally with correct credentials.
5. Repeat step 3 while signed in as the seeded Employee (not Admin/HR) or Manager.
6. **Expect**: 403 `FORBIDDEN` — only Admin/HR may unlock (FR-012).
7. Check `ActivityLog` for an `auth.account_unlocked` row after step 3's successful unlock.

## Scenario 5 — Offboarding revokes access immediately (Edge Cases)

1. Sign in as a seeded Employee; keep the session active (don't sign out).
2. In a separate Admin session, mark that Employee's record `OFFBOARDED` (via 002's employee
   management, or directly in test data if 002 isn't implemented yet).
3. Using the original session, perform any authenticated action.
4. **Expect**: refused, and the user is effectively signed out (their `RefreshToken` rows are
   revoked per FR-010 / data-model.md).

## Scenario 6 — Signing in elsewhere ends the previous session (FR-013)

1. Sign in as the seeded Employee from Device/Browser A. Confirm `GET /auth/me` succeeds.
2. Sign in as the same Employee from Device/Browser B (same credentials).
3. **Expect**: sign-in on B succeeds normally.
4. From Device/Browser A, call `POST /auth/refresh`.
5. **Expect**: 401 `INVALID_SESSION` — A's refresh token was revoked when B signed in.
6. From Device/Browser B, call `POST /auth/refresh`.
7. **Expect**: 200 — B's session remains valid.

## Success criteria checklist (from spec.md)

- [ ] SC-001: login → rendered dashboard under 5s
- [ ] SC-002: zero out-of-scope access across all 4 roles during the above scenarios
- [ ] SC-003: no forced sign-out during a continuous 8h session (Scenario 2)
- [ ] SC-004: every refused action returns a clear, non-technical message
