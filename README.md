# TeamLoom API

Backend for TeamLoom, an HR management ERP — Employee Management, Attendance & Leave, Payroll,
and Recruitment/ATS — as a Node/Express API. The Next.js frontend lives in its own repository.

- **Governance:** [`.specify/memory/constitution.md`](./.specify/memory/constitution.md) — the
  non-negotiable principles and locked technology stack.
- **Feature specs:** [`specs/`](./specs) — one directory per feature (spec → plan → tasks). This
  repo is the source of truth for specs used by both backend and frontend.

## Stack

Node.js/Express · PostgreSQL via Prisma · TypeScript · zod · JWT + RBAC · OpenAPI/Swagger · Vitest.

## Project structure

```
src/
  app.ts, server.ts   # Express app + entrypoint
  lib/                # jwt, logger, prisma client, roles, openapi
  middleware/         # authenticate, authorize, validate, errorHandler
  modules/<domain>/   # routes → controller → service → repository (+ schema.ts)
prisma/               # schema.prisma, migrations, seed.ts
specs/                # Spec-kit feature specifications (one per module)
.specify/             # Spec-kit config: constitution, templates, scripts
```

## Getting started

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev
npm run seed
npm run dev
```

The API listens on `:4000`. Or run Postgres and the API together with Docker:

```bash
npm run docker:up
```

Checks: `npm run typecheck`, `npm test`, `npm run build`.

## Spec-driven development

This repo uses [GitHub Spec Kit](https://github.com/github/spec-kit). Each feature moves through:

```
/speckit-specify → /speckit-plan → /speckit-tasks → /speckit-implement
```

001–004 have full plans and tasks and are implemented; 005 onward have a `spec.md` only — the
next step is `/speckit-plan` for whichever one is picked up first.

## Roadmap

**v0.1 — core MVP** (locked by the constitution's Technology Stack section):

| Spec | Feature |
|---|---|
| [001-auth-rbac](specs/001-auth-rbac/spec.md) | Authentication & Role-Based Access |
| [002-employee-management](specs/002-employee-management/spec.md) | Employee Management |
| [003-attendance-leave](specs/003-attendance-leave/spec.md) | Attendance & Leave |
| [004-payroll](specs/004-payroll/spec.md) | Payroll (structure + payslips, no statutory tax) |
| [005-recruitment-ats](specs/005-recruitment-ats/spec.md) | Recruitment / ATS |

**v1.1 — startup-grade additions**, layered on top of v0.1 without changing any of its principles:

| Spec | Feature | Why it's here |
|---|---|---|
| [006-notifications](specs/006-notifications/spec.md) | Notifications (email + in-app) | v0.1's biggest real-world adoption blocker |
| [007-employee-onboarding](specs/007-employee-onboarding/spec.md) | Employee onboarding workflow | Turns "create a record" into a guided process |
| [008-document-esignature](specs/008-document-esignature/spec.md) | Document management & e-signature | Offer letters, ID proofs, policy acknowledgment |
| [009-resignation-exit](specs/009-resignation-exit/spec.md) | Resignation & exit management | Formal notice period + clearance, not just a status flip |
| [010-statutory-payroll-tax](specs/010-statutory-payroll-tax/spec.md) | Statutory payroll tax & compliance | Supersedes 004's tax exclusion — see its Assumptions |
| [011-hr-analytics-reporting](specs/011-hr-analytics-reporting/spec.md) | HR analytics & reporting dashboards | Headcount, attrition, leave, payroll-cost trends |
| [012-performance-management](specs/012-performance-management/spec.md) | Performance management (goals/reviews) | Standard in modern HRMS suites |
| [013-sso-mfa](specs/013-sso-mfa/spec.md) | SSO (Google/Microsoft) & MFA | Removes the top B2B sales-blocker for password-only auth |
| [014-asset-expense-management](specs/014-asset-expense-management/spec.md) | Asset & expense management | Ties into onboarding/exit checklists |
| [015-multi-tenant-activation](specs/015-multi-tenant-activation/spec.md) | Multi-company/tenant activation | Fulfills Constitution Principle VI; touches every module |

`015-multi-tenant-activation` has the widest blast radius of the v1.1 set — it adds an
organization-scoping requirement to every other feature. Planning/building it early avoids
retrofitting it later.

**v1.2 — completeness additions**, rounding out the platform against modern HR-SaaS competitors:

| Spec | Feature | Why it's here |
|---|---|---|
| [016-org-chart-visualization](specs/016-org-chart-visualization/spec.md) | Interactive org chart | Company-wide visual chart, not just a per-employee mini view |
| [017-hr-helpdesk-ticketing](specs/017-hr-helpdesk-ticketing/spec.md) | HR helpdesk / ticketing | Tracked queries instead of side-channel Slack/email |
| [018-employee-engagement-surveys](specs/018-employee-engagement-surveys/spec.md) | Employee engagement & pulse surveys | eNPS + anonymous sentiment tracking |
| [019-mobile-pwa](specs/019-mobile-pwa/spec.md) | Mobile app / PWA | Check-in, leave, and approvals from a phone |
| [020-public-careers-portal](specs/020-public-careers-portal/spec.md) | Public careers page & self-apply | External counterpart to 005's internal-only ATS |
| [021-referral-program](specs/021-referral-program/spec.md) | Employee referral program | Referral bonus tracked through hire and into Payroll |
| [022-background-verification](specs/022-background-verification/spec.md) | Background verification | A formal check gate before "hired" in the pipeline |
| [023-learning-development](specs/023-learning-development/spec.md) | Learning & development | Course assignment + compliance-training completion |
| [024-succession-planning](specs/024-succession-planning/spec.md) | Succession planning | Critical-position and backup-candidate tracking |
| [025-white-labeling](specs/025-white-labeling/spec.md) | White-labeling | Per-tenant logo/branding (needs 015 active) |
| [026-global-multi-currency-payroll](specs/026-global-multi-currency-payroll/spec.md) | Global / multi-currency payroll | Extends 010 across countries and currencies |
| [027-hr-assistant-chatbot](specs/027-hr-assistant-chatbot/spec.md) | HR assistant chatbot | Natural-language Q&A, grounded in real data + RBAC |

Two hard-dependency notes for sequencing v1.2: `025-white-labeling` requires
`015-multi-tenant-activation` to mean anything, and `026-global-multi-currency-payroll` requires
`010-statutory-payroll-tax` and `004-payroll`. Everything else in v1.2 stands on its own.
