# Implementation Plan: Attendance & Leave

**Branch**: `003-attendance-leave` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-attendance-leave/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Daily check-in/check-out with computed hours worked, a configurable leave-type/balance system
with a Manager (or HR/Admin) approval workflow that only decrements balance on approval, and a
company holiday calendar. Leave-day counting excludes both weekends and holidays (spec
Clarifications). This fills in the already-scaffolded `apps/api/src/modules/attendance/*` stubs
and `apps/web` attendance/leave pages, reusing 001's auth middleware and 002's employee/
reporting-line service functions rather than duplicating either.

## Technical Context

**Language/Version**: TypeScript (Node.js, per repo `tsconfig.base.json`), strict mode.

**Primary Dependencies**: Express, Prisma (PostgreSQL), `zod`; frontend: Next.js 14 (App
Router), React Query, react-hook-form + zod.

**Storage**: PostgreSQL via Prisma. `Attendance`, `LeaveType`, `LeaveBalance`, `LeaveRequest`,
`Holiday` models already exist in `apps/api/prisma/schema.prisma` (added up front per
constitution Principle VI) — no migration needed for this feature's core scope; see
data-model.md for exact fields this feature reads/writes.

**Testing**: Vitest, already configured for both `apps/api` and `apps/web` (set up during
001-auth-rbac).

**Target Platform**: Linux server (Docker), behind a TLS-terminating reverse proxy — same
deployment as 001/002, no new infra.

**Project Type**: Web application — `apps/api` (backend) and `apps/web` (frontend), already
scaffolded including this feature's stub files.

**Performance Goals**: SC-001 — check-in/check-out completes in under 5s including page load.
SC-002 — filing a leave request completes in under 1 minute from opening the leave page.

**Constraints**: Leave-day counting MUST exclude weekends and company holidays (FR-007/FR-008/
FR-010, spec Clarifications) — the same working-day calculation is used at request-time
(balance check) and at approval-time (balance decrement), so they can never disagree. Balance
decrements MUST happen only on approval, never on submission (FR-010, SC-003) — this is a
Principle IV auditability concern as much as a functional one. A decided (approved/rejected)
`LeaveRequest` MUST NOT transition again (FR-012, SC-005) — matches constitution Principle IV's
one-directional state-machine rule exactly.

**Scale/Scope**: Single organization (multi-tenant deferred to 015); ~9 backend endpoints
(check-in, check-out, attendance history, leave-balance view, leave request create/list, leave
approve/reject, Manager/HR approval queues, leave-type/holiday CRUD).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Modular Monolith | Attendance/leave logic lives entirely in `apps/api/src/modules/attendance/*`; reporting-line/manager checks call 002's exported `getEmployee`/`getTeamView` rather than querying `Employee` directly | PASS |
| II. Independent Type Safety | `zod` schemas already stubbed in `modules/attendance/schema.ts`; `apps/web` keeps its own copies for its forms — no shared package | PASS |
| III. Security & RBAC by Default | Every route declares required role(s) via 001's `authorize(...)`; "my direct reports" scoping for the Manager approval queue evaluated in the service layer against 002's reporting-line data, per Principle III's explicit guidance | PASS |
| IV. Auditability & Data Integrity | Leave approvals are named in the constitution itself as an "irreversible business event" requiring an append-only `ActivityLog` row in the same transaction as the state change (FR-009/FR-010/FR-012) — this feature is exactly that example | PASS |
| V. Server-Rendered by Default | Attendance history and the leave-balance/request list are Server Components fetching from the API server-side; check-in/check-out buttons and the leave request form are Client Components (mutation + local state) | PASS |
| VI. Multi-Tenancy Readiness | `Attendance.orgId`, `LeaveType.orgId`, `LeaveBalance.orgId`, `LeaveRequest.orgId`, `Holiday.orgId` already present; every query scopes by `orgId` | PASS |
| VII. Simplicity & YAGNI | No new infra. Working-day calculation is a plain date-range loop against the `Holiday` table, not a calendar library or external service. Half-day leave, accrual/carry-over, and geofencing explicitly out of scope (spec Assumptions) | PASS |

No violations — Complexity Tracking section is not needed.

**Post-Phase 1 re-check**: No new tables or services introduced beyond what `schema.prisma`
already defines — Phase 1 design (data-model.md) documents usage of the existing models, not new
ones. All seven principles still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/003-attendance-leave/
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
│   └── schema.prisma          # Attendance/LeaveType/LeaveBalance/LeaveRequest/Holiday already
│                               # fully defined — no migration needed for this feature's scope
├── src/
│   ├── middleware/
│   │   ├── authenticate.ts    # from 001 — reused as-is, no change
│   │   └── authorize.ts       # from 001 — reused as-is, no change
│   └── modules/attendance/
│       ├── routes.ts          # POST /attendance/check-in, /check-out, GET /attendance/me,
│       │                      # GET/POST /leave-requests, POST /leave-requests/:id/approve,
│       │                      # POST /leave-requests/:id/reject, GET /leave-requests/queue,
│       │                      # GET /leave-balances/me, GET/POST /leave-types,
│       │                      # GET/POST /holidays (stub → implement)
│       ├── controller.ts      # parse/validate, call service, shape response (stub → implement)
│       ├── service.ts         # check-in/out, working-day calc, leave request/approval logic
│       │                      # (stub → implement)
│       ├── repository.ts      # Prisma Attendance/LeaveType/LeaveBalance/LeaveRequest/Holiday
│       │                      # queries (stub → implement)
│       └── schema.ts          # zod request/response schemas (already stubbed → verify/extend)

apps/web/
├── app/(app)/attendance/
│   └── page.tsx                # check-in/out + today's status + history (stub → implement)
├── app/(app)/leave/
│   └── page.tsx                # balance view + request form + history + (Manager/HR) queue
│                                # (stub → implement)
├── components/modules/attendance/
│   └── (new components: CheckInOutCard, LeaveRequestForm, LeaveBalanceCards, ApprovalQueue)
├── lib/
│   ├── auth-context.tsx        # existing (001) — read user.role for approval-queue visibility
│   └── api-client.ts           # existing (001) — reused as-is, no change
```

**Structure Decision**: Web application layout (`apps/api` + `apps/web`), same structure as 001/
002. No new directories introduced — this feature implements the already-scaffolded
`modules/attendance/*` stubs. Manager/reporting-line checks call 002's exported service
functions rather than querying `Employee` directly (Principle I); offboarding-driven session
revocation (if ever needed here) would similarly call 001's exported function rather than being
re-implemented.

## Complexity Tracking

No constitution violations — this section is not applicable.
