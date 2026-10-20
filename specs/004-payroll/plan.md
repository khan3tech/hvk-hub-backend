# Implementation Plan: Payroll

**Branch**: `004-payroll` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-payroll/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

HR/Admin defines a per-employee salary structure (base + standard components, versioned by
effective date), then triggers a monthly payroll run across all active employees that computes
each person's net pay — prorating for partial periods (joining/offboarding mid-period) and
deducting for unpaid leave taken — and produces one immutable payslip per employee per period,
safely replaceable on re-run. Employees see only their own payslips; Managers see their direct
reports' in view-only form. Fills in the already-scaffolded `apps/api/src/modules/payroll/*`
stubs, reusing 001's auth middleware, 002's employee status/reporting-line data, and 003's leave
data for the unpaid-leave deduction rather than duplicating either.

## Technical Context

**Language/Version**: TypeScript (Node.js, per repo `tsconfig.base.json`), strict mode.

**Primary Dependencies**: Express, Prisma (PostgreSQL), `zod`; frontend: Next.js 14 (App
Router), React Query, react-hook-form + zod.

**Storage**: PostgreSQL via Prisma. `SalaryStructure` and `Payslip` already exist in
`apps/api/prisma/schema.prisma` (added up front per constitution Principle VI) — no migration
needed for this feature's core scope; see data-model.md. `Payslip` already carries
`@@unique([employeeId, periodMonth, periodYear])`, which is what makes FR-006's
replace-not-duplicate re-run guarantee a database-level fact, not just application logic.

**Testing**: Vitest, already configured for both `apps/api` and `apps/web` (set up during
001-auth-rbac).

**Target Platform**: Linux server (Docker), behind a TLS-terminating reverse proxy — same
deployment as 001/002/003, no new infra.

**Project Type**: Web application — `apps/api` (backend) and `apps/web` (frontend), already
scaffolded including this feature's stub files.

**Performance Goals**: SC-001 — a full payroll run for the active workforce completes within a
few minutes for a typical company size (v0.1 scale — dozens to low hundreds of employees, not
sharded/batched processing). SC-003 — an Employee locates and opens a past payslip in under 30s.

**Constraints**: A payslip is immutable once generated except by a full re-run of its period
(FR-007, constitution Principle IV's explicit example: "a `Payslip` is immutable once generated;
re-running a payroll run for that period updates the existing row... rather than creating a
duplicate"). Proration (FR-012) and the unpaid-leave deduction (FR-004) both read from 002/003
via their exported service functions, never by querying `Employee`/`LeaveRequest` Prisma tables
directly from this module (Principle I).

**Scale/Scope**: Single organization (multi-tenant deferred to 015); single currency (026
deferred); ~6 backend endpoints (set/get salary structure, trigger payroll run, list/get own
payslips, list team payslips for Manager, list/get any payslip for HR/Admin).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Modular Monolith | Payroll logic lives entirely in `apps/api/src/modules/payroll/*`; reads employee status/dates via 002's exported functions and unpaid-leave data via a new 003 export (research.md R2), never another module's Prisma tables directly | PASS |
| II. Independent Type Safety | `zod` schemas already stubbed in `modules/payroll/schema.ts`; `apps/web` keeps its own copies for its forms — no shared package | PASS |
| III. Security & RBAC by Default | Every route declares required role(s) via 001's `authorize(...)`; "my direct reports" scoping for Manager payslip view evaluated in the service layer against 002's reporting-line data | PASS |
| IV. Auditability & Data Integrity | Constitution explicitly names payroll runs as an irreversible business event requiring an `ActivityLog` row in the same transaction as the state change; `Payslip` immutability (update-in-place on re-run, never a duplicate row) is the constitution's own worked example for this feature | PASS |
| V. Server-Rendered by Default | The payslip list/detail views are Server Components fetching from the API server-side; the salary-structure form and the "run payroll" trigger are Client Components (mutation + local state) | PASS |
| VI. Multi-Tenancy Readiness | `SalaryStructure.orgId`, `Payslip.orgId` already present; every query scopes by `orgId` | PASS |
| VII. Simplicity & YAGNI | No new infra, no job queue for the payroll run (constitution explicitly defers BullMQ until synchronous runs prove too slow — v0.1 scale doesn't). Proration and unpaid-leave math are plain arithmetic against existing data, not a new calculation engine | PASS |

No violations — Complexity Tracking section is not needed.

**Post-Phase 1 re-check**: No new tables introduced beyond what `schema.prisma` already defines.
The one new cross-module surface — 003 gains an exported `getUnpaidLeaveDaysForPeriod` function
(research.md R2) — is an addition to an existing module's public service API, not a new
dependency or infra component; re-checked against Principle I (the calling module still never
touches another module's Prisma tables) and Principle VII (no new abstraction, just one more
exported function alongside the ones 003 already has). All seven principles still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/004-payroll/
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
│   └── schema.prisma          # SalaryStructure/Payslip already fully defined — no migration
│                               # needed for this feature's scope
├── src/
│   ├── middleware/
│   │   ├── authenticate.ts    # from 001 — reused as-is, no change
│   │   └── authorize.ts       # from 001 — reused as-is, no change
│   ├── modules/employee/
│   │   └── service.ts         # 002's getEmployee/getTeamView — reused as-is, no change
│   ├── modules/attendance/
│   │   └── service.ts         # 003 — gains one new exported function (research.md R2),
│   │                          # everything else reused as-is
│   └── modules/payroll/
│       ├── routes.ts          # POST /payroll/salary-structures/:employeeId,
│       │                      # GET /payroll/salary-structures/:employeeId,
│       │                      # POST /payroll/runs, GET /payroll/payslips/me,
│       │                      # GET /payroll/payslips/team, GET /payroll/payslips
│       │                      # (stub → implement)
│       ├── controller.ts      # parse/validate, call service, shape response (stub → implement)
│       ├── service.ts         # salary-structure versioning, payroll-run computation
│       │                      # (proration, unpaid-leave deduction), payslip scoping
│       │                      # (stub → implement)
│       ├── repository.ts      # Prisma SalaryStructure/Payslip queries (stub → implement)
│       └── schema.ts          # zod request/response schemas (already stubbed → extend/verify)

apps/web/
├── app/(app)/payroll/
│   ├── page.tsx                # own payslip list (Employee) / team view (Manager) / org view
│   │                            # + salary-structure management (HR/Admin) (stub → implement)
│   └── [employeeId]/page.tsx   # one employee's salary structure + payslip history, scoped by
│                                # caller's role (stub → implement)
├── components/modules/payroll/
│   └── (new components: SalaryStructureForm, PayrollRunTrigger, PayslipList, PayslipDetail)
├── lib/
│   ├── auth-context.tsx        # existing (001) — role-gate the run-payroll trigger and edit UI
│   └── api-client.ts           # existing (001) — reused as-is, no change
```

**Structure Decision**: Web application layout (`apps/api` + `apps/web`), same structure as
001/002/003. No new directories introduced — this feature implements the already-scaffolded
`modules/payroll/*` stubs. Cross-module reads go through 002's and 003's exported service
functions (Principle I); this module owns only `SalaryStructure` and `Payslip`.

## Complexity Tracking

No constitution violations — this section is not applicable.
