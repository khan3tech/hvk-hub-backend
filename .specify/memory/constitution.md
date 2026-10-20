<!--
Sync Impact Report
- Version change: 2.1.0 → 2.2.0
- Modified sections: Principle I, Technology Stack (Repository layout, Deployment) — the API and
  web apps now live in two separate repositories (backend: this repo, API at the repo root;
  frontend: its own repo). No principle changes meaning; Principle II's "no shared package, no
  cross-app import" rule is now enforced by the repository boundary itself.
- Templates requiring follow-up: none

Prior amendment (2.0.0 → 2.1.0):
- Version change: 2.0.0 → 2.1.0
- Modified principles: none
- Added sections/guidance:
  - Technology Stack: new "API Documentation" bullet (OpenAPI/Swagger).
  - Development Workflow: new "API documentation" bullet requiring every endpoint to be
    documented in the OpenAPI spec and served via Swagger UI in non-production environments.
- Removed sections: none
- Templates requiring follow-up: none
- Deferred TODOs: none
- Rationale: as the API surface grows across 27 specced features, a browsable, always-current
  OpenAPI/Swagger contract for every endpoint is required so consumers (the frontend, future
  integrations, API-first spec/plan authoring) don't have to read route source to know the
  contract.

Prior amendment (1.0.0 → 2.0.0): Principle I reworded to drop the shared `packages/types`
package; Principle II renamed II. Type Safety & Shared Contracts → II. Independent Type Safety —
apps/api and apps/web now own and validate against their own contracts so the two apps stay
splittable into separate repositories.
-->

# TeamLoom Constitution

## Core Principles

### I. Modular Monolith, Not Microservices
The backend is one deployable Express service with four internal modules — employee,
attendance-leave, payroll, recruitment — each split into `routes → controllers → services →
repositories` layers. Every module's business logic MUST live in its `service.ts`; a module
MUST NOT query another module's Prisma tables directly, it MUST call that module's service.
The frontend (`apps/web`) and backend (`apps/api`) are two independently deployable apps, each
with its own `package.json` and its own copy of any type it needs — see Principle II. They live
in separate repositories: this repository is the backend (the API sits at the repo root, and
`apps/api` elsewhere in this document means that root); the frontend has its own repository. Splitting a backend module into its own service requires a demonstrated scaling or
deployment-independence need, not speculation about future load.

### II. Independent Type Safety (NON-NEGOTIABLE)
TypeScript is used everywhere — no `.js` source files in `apps/api` or `apps/web`. Every request
body and query MUST be validated against a `zod` schema before it reaches a controller. Each app
owns and validates against its *own* schemas — `apps/api`'s live next to the module that owns
them (`schema.ts` per module); `apps/web` keeps its own copies for its `react-hook-form` +
`zodResolver` forms and for parsing API responses. `apps/api` and `apps/web` MUST NOT import from
each other's source tree, and MUST NOT depend on a shared types package: the two apps are meant
to be extractable into separate repositories at any time, and a shared internal package or a
cross-app import is exactly the kind of coupling that would block that split. The accepted cost
is duplication — a contract changing on one side is caught by testing against the documented API
endpoint catalog (see specs), not by a shared compile-time type.

### III. Security & RBAC by Default
Every new route MUST declare its required role(s) (`ADMIN` / `HR` / `MANAGER` / `EMPLOYEE`) and
MUST enforce them in the service layer, not only at the route — "my team" or "my department"
scoping depends on reporting-line data that only the service layer can evaluate correctly.
Passwords are hashed with bcrypt (cost 12). Sessions use a short-lived access JWT (15 min) plus
an httpOnly refresh cookie (7 days); the refresh token MUST NOT be reachable from JavaScript.
Helmet defaults, a CORS allowlist of known frontend origins, and rate limiting on `/auth/*` are
mandatory on every environment, not opt-in per deployment.

### IV. Auditability & Data Integrity
Leave approvals, payroll runs, and recruitment pipeline-stage changes are irreversible business
events and MUST write an append-only `ActivityLog` row (actor, action, entity, before/after) in
the same transaction as the state change. State machines are explicit and one-directional: a
`LeaveRequest` moves `PENDING → APPROVED` or `PENDING → REJECTED` and no further transition is
permitted — a mistaken approval is corrected with a new, compensating request, never an edit to
history. A `Payslip` is immutable once generated; re-running a payroll period updates the
existing row for that employee-period rather than creating a duplicate.

### V. Server-Rendered by Default, Client Only for Interaction
A page is a Next.js Server Component by default, fetching directly from the API and rendering on
the server so the RBAC check happens before any HR data reaches the browser. A component becomes
a Client Component only when it needs local state or a mutation (forms, the leave-approval
queue, the recruitment pipeline board). Server state (anything from the API) is owned by React
Query — components MUST NOT hand-roll their own loading/error/cache state for API data. Local
UI-only state (a modal open, sidebar collapsed) may live in plain React state or Zustand, and
MUST NOT hold anything HR-related.

### VI. Multi-Tenancy Readiness
Every core table carries an `orgId` column from day one, even though v0.1 seeds and operates a
single organization. This is a schema decision made once, up front, specifically so that adding
a second tenant later is a config and query-scoping change, not a migration that touches every
table.

### VII. Simplicity & YAGNI
Redis, a job queue (BullMQ), and any microservice split are NOT part of v0.1. The service layer
is written so it *could* be called from a queue worker instead of an HTTP controller without
modification, but the queue itself is only built when synchronous payroll runs or email sends
actually become too slow to serve inline. Do not add infrastructure for a scaling problem that
has not yet occurred.

## Technology Stack

Locked for v0.1 — a change here is a MAJOR constitution amendment, not a per-feature choice:

- **Backend**: Node.js + Express, PostgreSQL via Prisma, TypeScript.
- **Frontend**: Next.js 14 (App Router), Tailwind CSS + shadcn/ui, React Query, react-hook-form +
  zod.
- **Auth**: JWT access token (15 min) + httpOnly refresh cookie (7 days), RBAC middleware for
  four roles (ADMIN, HR, MANAGER, EMPLOYEE).
- **Repository layout**: two repositories — the backend repo (this one: API at the root, plus
  `specs/` and `.specify/`, which stay the source of truth for every feature) and a separate
  frontend repo for `apps/web`. No shared package between them (Principle II).
- **Validation**: zod schemas, defined independently in each app (not shared).
- **API Documentation**: an OpenAPI (Swagger) spec for `apps/api`, generated from — or kept
  hand-in-hand with — each module's `schema.ts` and `routes.ts`, served via Swagger UI in every
  non-production environment. Every endpoint MUST appear in it; this is Principle II's "documented
  API endpoint catalog" made machine-readable and browsable, not a separate source of truth.
- **Deployment**: each app has its own `Dockerfile` and its own `.env`/`.env.example` (the
  backend's is `.env.example` at this repo's root), built and deployed independently. Docker
  containers run behind a TLS-terminating reverse proxy; managed PostgreSQL (RDS-class, or
  Supabase/Neon for the MVP). Config via environment variables only — no secrets in the repo.

Explicitly out of scope for v0.1: statutory tax filing/compliance, notification/email delivery,
activating a second tenant, a mobile client, splitting the API into microservices, and
Redis/queue infrastructure. These are named so they are not accidentally half-built; each has a
seam in the design (an `orgId` column, a service layer callable from a worker) so building them
later doesn't require a re-architecture.

## Development Workflow

- **Spec-driven**: every feature moves through `/speckit-specify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`. A change larger than a trivial fix or typo MUST NOT
  skip straight to code.
- **Module boundaries**: each backend module ships exactly `routes.ts`, `controller.ts`,
  `service.ts`, `repository.ts`, `schema.ts`. Controllers parse/validate and shape HTTP
  responses; they MUST NOT contain business logic. Repositories are the only place Prisma is
  called from.
- **Error shape**: every API error response has the shape
  `{ error: { code, message, fields? } }`. Domain errors are thrown as typed errors from the
  service layer and mapped by one central error-handling middleware — controllers MUST NOT write
  their own try/catch for domain errors.
- **API-first**: an endpoint's method, path, required role, and purpose are written down (in the
  spec/plan) before the handler is implemented.
- **API documentation**: every endpoint MUST be added to the OpenAPI/Swagger spec (see Technology
  Stack) as part of the same change that implements it — a PR adding or changing a route without
  a corresponding spec update is incomplete. Swagger UI MUST be reachable in dev/staging so the
  frontend and any integration can browse the live contract without reading `apps/api` source.

## Governance

This constitution supersedes ad hoc convention in this repository. Any pull request that
deviates from a principle above MUST justify the deviation in its description, or it is not
mergeable as-is. Amendments follow the same semantic-versioning rule as this document's own
version line:

- **MAJOR** — a principle is removed or redefined in a backward-incompatible way (e.g., dropping
  RBAC enforcement, changing the locked technology stack).
- **MINOR** — a new principle or section is added, or existing guidance is materially expanded.
- **PATCH** — wording, clarification, or typo fixes with no semantic change.

Tactical, day-to-day agent guidance (build commands, file conventions an agent needs to run
tools) belongs in `CLAUDE.md`, not here — this file governs *what must always be true*, not *how
to invoke the linter*.

**Version**: 2.2.0 | **Ratified**: 2026-09-13 | **Last Amended**: 2026-10-20
