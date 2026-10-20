# Implementation Plan: Employee Management

**Branch**: `002-employee-management` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-employee-management/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

CRUD for the `Employee` system-of-record (plus its `Department`/`Designation` lookup lists),
provisioning a linked `User` login account on creation, a role-scoped directory (Employee: self +
basic colleague info; Manager: self + direct reports in full; HR/Admin: everyone in full), and
offboarding as the only deactivation path (no hard delete). This is the system of record every
other TeamLoom module (attendance, payroll, recruitment) reads from — it fills in the
already-scaffolded `apps/api/src/modules/employee/*` stubs and the `apps/web` directory pages
rather than starting from nothing, and reuses 001's `authenticate`/`authorize` middleware and its
`RBAC` matrix pattern rather than inventing a new one.

## Technical Context

**Language/Version**: TypeScript (Node.js, per repo `tsconfig.base.json`), strict mode.

**Primary Dependencies**: Express, Prisma (PostgreSQL), `zod`, `bcrypt` (for provisioning the
linked User's initial password); frontend: Next.js 14 (App Router), React Query,
react-hook-form + zod.

**Storage**: PostgreSQL via Prisma. `Employee`, `Department`, `Designation`, and `User` models
already exist in `apps/api/prisma/schema.prisma` (added up front per constitution Principle VI)
— no schema migration is needed for this feature's core scope; see data-model.md for the exact
fields this feature reads/writes on each.

**Testing**: Vitest, already configured for both `apps/api` and `apps/web` (set up during
001-auth-rbac).

**Target Platform**: Linux server (Docker), behind a TLS-terminating reverse proxy — per
constitution Technology Stack. Same deployment as 001; no new infra.

**Project Type**: Web application — two independently deployable apps, `apps/api` (backend) and
`apps/web` (frontend), already scaffolded in this repo (including this feature's stub files).

**Performance Goals**: SC-001 — HR can onboard a new employee end-to-end in under 2 minutes
(mostly a UX/form-design concern, not a backend latency target). SC-003 — an org-chart change is
visible to all affected users within the same session (no client-side caching staleness).

**Constraints**: Every employee-management endpoint MUST declare and enforce its required
role(s) per constitution Principle III, with "my team"/"my department" scoping evaluated in the
service layer (this module *is* the reporting-line data other modules' scope checks depend on —
constitution Principle III's example). Offboarding is the only deactivation path (FR-007); no
endpoint may hard-delete an `Employee` row (spec User Story 3, Acceptance Scenario 3).

**Scale/Scope**: Single organization (multi-tenant deferred to 015); ~8-10 backend endpoints
(create/list/get/update employee, offboard employee, list/create department, list/create
designation, manager's team/reporting-line view) plus the directory UI.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Modular Monolith | Employee logic lives entirely in `apps/api/src/modules/employee/*`; this module owns `Employee`/`Department`/`Designation` Prisma queries — other modules (attendance, payroll, recruitment) read employee data only by calling this module's exported service functions, never its Prisma tables directly | PASS |
| II. Independent Type Safety | `zod` schemas already stubbed in `modules/employee/schema.ts` (apps/api-local); `apps/web` keeps its own copies for its directory/form components — no shared package | PASS |
| III. Security & RBAC by Default | Every route declares required role(s) via 001's `authorize(...)` middleware; "my team" scoping (Manager sees only direct reports) is evaluated in `service.ts` against `Employee.managerId`, per Principle III's explicit example of this exact case | PASS |
| IV. Auditability & Data Integrity | FR-011 (record who changed an employee record and when) requires an `ActivityLog` write in the same transaction as create/update/offboard | PASS |
| V. Server-Rendered by Default | The directory list and an employee's profile page are Server Components fetching from the API server-side (RBAC-scoped before any HR data reaches the browser); the new-employee form and edit form are Client Components (mutation + local form state) | PASS |
| VI. Multi-Tenancy Readiness | `Employee.orgId`, `Department.orgId`, `Designation.orgId` already present in schema; every query in this feature scopes by `orgId` | PASS |
| VII. Simplicity & YAGNI | No new infra. Employee code generation is a simple deterministic sequence/format (see research.md), not a separate ID-generation service. Bulk CSV import explicitly out of scope (spec Assumptions) | PASS |

No violations — Complexity Tracking section is not needed.

**Post-Phase 1 re-check**: No new tables or services were introduced beyond what
`schema.prisma` already defines — Phase 1 design (data-model.md) only documents how this
feature *uses* the existing `Employee`/`Department`/`Designation`/`User` models, it does not add
to them. All seven principles still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/002-employee-management/
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
│   └── schema.prisma        # Employee/Department/Designation/User already fully defined —
│                             # no migration needed for this feature's core scope
├── src/
│   ├── middleware/
│   │   ├── authenticate.ts  # from 001 — reused as-is, no change
│   │   └── authorize.ts     # from 001 — reused as-is, no change
│   └── modules/employee/
│       ├── routes.ts        # GET/POST /employees, GET/PATCH /employees/:id,
│       │                    # POST /employees/:id/offboard, GET /employees/me/team,
│       │                    # GET/POST /departments, GET/POST /designations (stub → implement)
│       ├── controller.ts    # parse/validate, call service, shape response (stub → implement)
│       ├── service.ts       # create/update/offboard/directory-scope business logic
│       │                    # (stub → implement)
│       ├── repository.ts    # Prisma Employee/Department/Designation queries (stub → implement)
│       └── schema.ts        # zod request/response schemas (already stubbed → extend/verify)

apps/web/
├── app/(app)/employees/
│   ├── page.tsx              # role-scoped directory list + search/filter (stub → implement)
│   └── [id]/page.tsx         # employee profile view + edit form for HR/Admin (stub → implement)
├── components/modules/employee/
│   └── (new components as needed: EmployeeForm, DirectoryTable, TeamView — README.md exists,
│     no components yet)
├── lib/
│   ├── auth-context.tsx      # existing (001) — read user.role to scope directory queries
│   └── api-client.ts         # existing (001) — reused for all employee/department/designation
│                              # calls, no change needed
```

**Structure Decision**: Web application layout (`apps/api` + `apps/web`, two independently
deployable apps per constitution Principle I) — same structure as 001. No new directories are
introduced — this feature implements the employee-module stubs already scaffolded for it. Other
modules needing employee data (e.g. 003's leave-approval reporting-line check, 004's payroll
eligibility) call this module's exported service functions; none of them import
`modules/employee/repository.ts` directly (Principle I).

## Complexity Tracking

No constitution violations — this section is not applicable.
