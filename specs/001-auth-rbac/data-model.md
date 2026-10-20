# Phase 1 Data Model: Authentication & Role-Based Access

Builds on the existing `apps/api/prisma/schema.prisma`. Two changes to the `User` model, one new
model. All other models referenced here (Employee) already exist and are unchanged by this
feature.

## User (modified)

Existing fields unchanged (`id`, `orgId`, `email`, `passwordHash`, `role`, `employeeId`,
`employee`, `isBreakGlass`, `ssoIdentityLinks`, `mfaEnrollment`, `notifications`,
`deviceRegistrations`, `createdAt`, `updatedAt`, `@@unique([orgId, email])`, `@@index([orgId])`).

New fields (this feature):

| Field | Type | Notes |
|---|---|---|
| `failedLoginAttempts` | `Int @default(0)` | Incremented on each failed sign-in; reset to 0 on successful sign-in or manual unlock. |
| `lockedAt` | `DateTime?` | Set when `failedLoginAttempts` reaches the threshold (3, env-configurable). `NULL` = not locked. Doubles as the lock timestamp — no separate boolean. |

New relation:

| Field | Type | Notes |
|---|---|---|
| `refreshTokens` | `RefreshToken[]` | See below. |

**Validation rules** (enforced in `modules/auth/service.ts`, not the schema):
- `email` must be a valid email format, lowercased before storage/lookup (case-insensitive
  uniqueness within an org).
- A locked user (`lockedAt IS NOT NULL`) MUST be refused sign-in regardless of credential
  correctness (spec Edge Cases).
- A user whose linked `Employee.status = OFFBOARDED` MUST be refused sign-in and have any active
  refresh tokens revoked (FR-010).

**State transitions** (`failedLoginAttempts` / `lockedAt`):

```
ACTIVE (attempts=0, lockedAt=null)
  --failed login--> ACTIVE (attempts+1)
  --failed login, attempts reaches threshold--> LOCKED (lockedAt=now())
  --successful login (while ACTIVE)--> ACTIVE (attempts reset to 0)
LOCKED (lockedAt set)
  --any login attempt--> refused, no state change (no auto-unlock)
  --Admin/HR unlock action--> ACTIVE (attempts=0, lockedAt=null); ActivityLog row written
```

## RefreshToken (new model)

Backs Phase 0 Decision R1 (hybrid session model): the access token stays a stateless JWT; the
refresh token is a stored, revocable row so sign-out (FR-003) and offboarding (FR-010) take
effect immediately instead of waiting for natural JWT expiry.

```prisma
model RefreshToken {
  id         String    @id @default(cuid())
  orgId      String
  userId     String
  user       User      @relation(fields: [userId], references: [id])
  tokenHash  String    // sha256 of the raw refresh token; raw value never stored
  expiresAt  DateTime  // issuedAt + 7 days
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())

  @@index([userId])
  @@index([tokenHash])
}
```

**Validation rules**:
- `tokenHash` is looked up (never the raw token) on `POST /auth/refresh`.
- A token is valid only if `revokedAt IS NULL AND expiresAt > now()`.
- `POST /auth/logout` sets `revokedAt = now()` on the presented token's row.
- FR-010 (offboarding) and account lockout (FR-011) MUST revoke all of a user's non-revoked
  `RefreshToken` rows, not just reject future sign-ins.
- FR-013 (single active session, spec Clarifications 2026-09-14): `POST /auth/login` MUST revoke
  all of the user's existing non-revoked `RefreshToken` rows before creating the new one, so at
  most one row per user is ever non-revoked at a time (see research.md R6).

**Lifecycle**: rows are never deleted, only marked `revokedAt` — consistent with constitution
Principle IV's append-only audit posture, and cheap enough at this scale (one row per login, per
user) not to need a cleanup job in v0.1.

## ActivityLog (existing model, new usage)

No schema change. This feature writes two new `action` values into the existing model:
- `action: "auth.sign_in"` — on every successful login, `entity: "User"`, `after: { at, ip? }` — satisfies FR-009.
- `action: "auth.account_unlocked"` — on manual unlock, `entity: "User"`, `actorId` = the
  Admin/HR user who unlocked, `before: { lockedAt }`, `after: { lockedAt: null }` — satisfies
  FR-012's audit requirement.

Note: `ActivityLog.actorId` references `Employee`, not `User`. An Admin/HR user without a linked
`Employee` record (see spec's Key Entities note on system-administrator accounts) cannot be
attributed via this table as-is — flagged for `/speckit-tasks` to decide whether such accounts
are out of scope for the unlock action or whether `ActivityLog.actorId` needs to become optional.
This is a genuine open point, not silently resolved here.

## Role (existing enum, unchanged)

`ADMIN | HR | MANAGER | EMPLOYEE` — already defined in schema.prisma, matches spec's Key
Entities exactly. No change.

## Employee (existing model, referenced not modified)

`Employee.managerId` (self-relation `EmployeeManager`) is the reporting-line data RBAC scope
checks depend on (FR-006). This feature reads it in `authorize`-adjacent service-layer checks but
does not modify the Employee model. A `managerId` pointing to a deactivated User's Employee
record resolves to "no direct reports" at query time (per spec Edge Cases clarification) — this
is a query-shape concern for `/speckit-tasks`, not a schema change.
