# Tasks: Multi-Company / Tenant Activation

**Input**: plan.md, contracts/platform-api.md, quickstart.md. Backend only.

## Phase 1: Setup
- [X] T001 Migrations `multi_tenant` + `default_organization` (data); seed Organization + operator
- [X] T002 `orgId` in access/MFA tokens; `lib/tenant.ts orgOf(req)`; all controllers switched from `DEFAULT_ORG_ID`

## Phase 2: US1 — Isolated organizations (P1)
- [X] T003 Login resolves the org by email (+ `organization` slug); refresh/SSO/MFA carry the org
- [X] T004 Platform tier: operator login (own secret, lockout), provisioning with first Admin + rollback (FR-001/005)

## Phase 3: US2 — Every module scoped (P1)
- [X] T005 Audit of foreign-ID writes; org checks on employee lookups, salary structures, HR leave, docs/performance employee lookups (FR-003/004)
- [X] T006 Cross-org e2e across all modules (FR-010, SC-001)

## Phase 4: US3 — Operator oversight (P2)
- [X] T007 List with usage counts (FR-006/008); suspend/reactivate enforced at sign-in, refresh and per request (FR-007, SC-003)

## Phase 5: Polish
- [X] T008 Unit tests (6 platform + 1 auth org-ambiguity); `scripts/e2e/015-multi-tenant.mjs` (35 checks)
