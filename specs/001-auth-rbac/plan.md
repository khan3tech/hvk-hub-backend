# Implementation Plan: Authentication & Role-Based Access

**Branch**: `001-auth-rbac` | **Date**: 2026-09-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-auth-rbac/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Email/password sign-in issuing a short-lived JWT access token plus an httpOnly refresh cookie,
an Express RBAC middleware pair (`authenticate` + `authorize`) enforced in every other module's
service layer, and account-lockout after repeated failed attempts (manual Admin/HR unlock only,
audited). This is the foundation every other TeamLoom module depends on — it fills in the
already-scaffolded `apps/api/src/modules/auth/*` stubs and `apps/web` auth plumbing rather than
starting from nothing.

## Technical Context

**Language/Version**: TypeScript (Node.js, per repo `tsconfig.base.json`), strict mode.

**Primary Dependencies**: Express, Prisma (PostgreSQL), `jsonwebtoken`, `bcrypt`, `zod`,
`helmet`, `express-rate-limit`; frontend: Next.js 14 (App Router), React Query,
react-hook-form + zod.

**Storage**: PostgreSQL via Prisma. `User` table already defined in `apps/api/prisma/schema.prisma`;
this feature adds lockout fields to it (see data-model.md) — no new top-level table for the
lockout state itself.

**Testing**: Vitest, already configured for `apps/api` (`"test": "vitest run"`). `apps/web` has
no test runner yet — this feature adds Vitest + React Testing Library there too. See
research.md R4.

**Target Platform**: Linux server (Docker), behind a TLS-terminating reverse proxy — per
constitution Technology Stack.

**Project Type**: Web application — two independently deployable apps, `apps/api` (backend) and
`apps/web` (frontend), already scaffolded in this repo.

**Performance Goals**: SC-001 — login-to-dashboard render under 5s on a normal connection.

**Constraints**: Access JWT 15 min TTL, refresh cookie 7 days, httpOnly + not JS-readable
(constitution Principle III, non-negotiable). Rate limiting mandatory on `/auth/*` in every
environment.

**Scale/Scope**: Single organization (multi-tenant deferred to 015); 4 roles; ~5 backend
endpoints (login, refresh, logout, me, unlock) plus RBAC middleware consumed by every other
module.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Modular Monolith | Auth lives entirely in `apps/api/src/modules/auth/*`; other modules call `authenticate`/`authorize` middleware and read `req.user`, never Prisma `User` rows directly | PASS |
| II. Independent Type Safety | `zod` schemas already stubbed in `modules/auth/schema.ts` (apps/api-local); `apps/web` keeps its own `AuthUser` copy (`lib/auth-user.ts`) — no shared package | PASS |
| III. Security & RBAC by Default | bcrypt cost 12, JWT 15m + httpOnly refresh 7d, rate limiting on `/auth/*`, every route declares required role(s) — all directly specified by this feature | PASS |
| IV. Auditability & Data Integrity | FR-009 (sign-in log) and FR-012 (audited unlock) both require `ActivityLog` writes in the same transaction as the state change | PASS |
| V. Server-Rendered by Default | `apps/web/middleware.ts` already gates Server Components on a session cookie before any HR data fetch | PASS |
| VI. Multi-Tenancy Readiness | `User.orgId` already present in schema; login/lockup queries scope by `[orgId, email]` | PASS |
| VII. Simplicity & YAGNI | No Redis/queue introduced; rate limiting uses in-memory `express-rate-limit` per constitution's "not opt-in" mandate, not a new infra dependency | PASS |

No violations — Complexity Tracking section is not needed.

**Post-Phase 1 re-check**: The new `RefreshToken` model (data-model.md, research.md R1) adds one
small table, not a new service or infra dependency — re-checked against Principle VII
(Simplicity & YAGNI): justified because it's the only way to satisfy FR-003/FR-010/FR-012's
"immediate" revocation requirement without making every request pay a DB lookup (which would
instead risk SC-001's 5s budget and Principle VII from the other direction). FR-013 (single
active session, spec Clarifications 2026-09-14) is satisfied by a behavior change to
`POST /auth/login` (revoke prior non-revoked `RefreshToken` rows before issuing a new one,
research.md R6) — no new table, service, or infra, so Principle VII still holds. All other gates
unchanged post-design. Still PASS on all seven principles.

## Project Structure

### Documentation (this feature)

```text
specs/001-auth-rbac/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Both apps already exist and are scaffolded with stub files for this feature; this plan fills
them in rather than creating new top-level structure.

```text
apps/api/
├── prisma/
│   └── schema.prisma        # User model gets lockout fields added (data-model.md)
├── src/
│   ├── lib/
│   │   ├── jwt.ts            # sign/verify access + refresh tokens (stub exists)
│   │   ├── roles.ts          # ROLES const (exists, no change)
│   │   └── prisma.ts         # Prisma client singleton (exists)
│   ├── middleware/
│   │   ├── authenticate.ts   # verify Bearer access token, attach req.user (stub → implement)
│   │   ├── authorize.ts      # route-level role gate (stub → implement)
│   │   └── errorHandler.ts   # existing central error mapper, no change
│   └── modules/auth/
│       ├── routes.ts         # POST /auth/login, /auth/refresh, /auth/logout, GET /auth/me,
│       │                     # POST /auth/:userId/unlock (stub → implement)
│       ├── controller.ts     # parse/validate, call service, shape response (stub → implement)
│       ├── service.ts        # login, lockout, session, unlock business logic (stub → implement)
│       ├── repository.ts     # Prisma User queries (stub → implement)
│       └── schema.ts         # zod request/response schemas (partially exists → extend)

apps/web/
├── middleware.ts              # session-cookie gate on Server Components (exists, no change)
├── app/(auth)/login/page.tsx  # login form (stub → implement)
├── app/(app)/layout.tsx       # role-appropriate nav shell (stub → implement, reads useAuth())
├── lib/
│   ├── auth-context.tsx       # React context for signed-in user (exists, no change)
│   ├── auth-user.ts           # AuthUser type, apps/web's own copy (exists, no change)
│   ├── api-client.ts          # fetch wrapper: attach token, 401 → refresh → retry (stub → implement)
│   └── api-error.ts           # ApiError shape (exists, no change)
```

**Structure Decision**: Web application layout (`apps/api` + `apps/web`, two independently
deployable apps per constitution Principle I). No new directories are introduced — this feature
implements the auth-module and RBAC-middleware stubs already scaffolded for it. Other modules'
routes call `authenticate`/`authorize` from `apps/api/src/middleware/*`; none of them import
from `modules/auth/*` directly (Principle I: cross-module calls happen through exposed
middleware, not another module's internals).

## Complexity Tracking

No constitution violations — this section is not applicable.
