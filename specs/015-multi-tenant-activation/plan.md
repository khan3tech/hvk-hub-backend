# Implementation Plan: Multi-Company / Tenant Activation

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

Every repository query already took an `orgId` (Constitution Principle VI); what was missing was
where it came from. Every controller read a fixed `DEFAULT_ORG_ID`. This feature makes `orgId`
load-bearing:

- **Tenant per request**: the user's organization is resolved at sign-in, carried in the access
  token and read per request.
- **Platform tier**: a separate super-admin tier (`/api/platform`) provisions, lists and
  suspends organizations.
- **Proof**: an automated cross-org test probes every module.

Backend only.

## Technical Context

- **Migration `multi_tenant`**: Organization `slug` (unique), `suspendedAt`; SuperAdmin
  `failedLoginAttempts`, `lockedAt`.
- **Migration `default_organization`** (data only): inserts the v0.1 org (`id = slug =
  "default"`) so existing data keeps working unchanged (FR-009, SC-004).
- **Seed**: creates the Organization row and a platform operator (`platform@teamloom.dev`, or
  `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`).

## Research & decisions

- **R1 — Tenant per request**: `AccessTokenPayload.orgId` (and the MFA challenge token's) is set
  at sign-in. Every controller uses `lib/tenant.ts` `orgOf(req)` instead of an env constant. The
  client never chooses its org for authenticated calls.
- **R2 — Sign-in resolution**: emails are unique per org. Login finds the user by email across
  orgs, and an optional `organization` slug disambiguates. An email in several orgs without a
  slug gets 400 `ORGANIZATION_REQUIRED`. Refresh uses the stored user's org. SSO takes
  `?organization=<slug>` on start and carries the org in its signed flow cookie.
- **R3 — Suspension (FR-007, SC-003)**: checked at sign-in, at refresh and in `authenticate` on
  every request (one primary-key read). Suspended orgs get 403 `ORGANIZATION_SUSPENDED`
  immediately, not when tokens expire. Auth reaches organizations only through a registered
  `OrganizationDirectory`, so there's no import cycle.
- **R4 — Super-admin tier (FR-005)**: its own table, a token secret derived as
  `JWT_ACCESS_SECRET:platform`, its own middleware and its own rate-limited login with lockout.
  Org tokens can't reach `/api/platform` and platform tokens can't reach org APIs (verified).
- **R5 — Provisioning (FR-001, SC-002)**: an org plus starter "General" department and
  "Administrator" designation, and its first Admin created through 002's `createEmployee` (so
  007's checklist hook applies too). A temporary password is returned once. It rolls back if the
  admin can't be created.
- **R6 — Usage (FR-008)**: active employee count, user count and last ActivityLog timestamp.
  Counts only, never HR content.
- **R7 — Foreign-ID writes (FR-003)**: reads were already scoped. The audit added checks on
  writes that took cross-org IDs:
  - employee create/update department/designation;
  - payroll salary structure;
  - HR leave on behalf;
  - documents and performance lookups for an employee outside the org now return 404 instead of
    an empty list.
- **R8 — Verification (FR-010, SC-001)**: `scripts/e2e/015-multi-tenant.mjs` creates org-A
  records in every module, provisions org B, and asserts org B's lists never contain them,
  direct lookups and actions by ID are refused, and writes referencing A's IDs fail. It also
  covers independent payroll, same-named lookups, same email in two orgs, and
  suspend/reactivate.

## Constitution Check

VI (Multi-Tenancy Readiness) fulfilled · I PASS (organizations reached via a directory hook;
provisioning via 002's service) · II PASS · III PASS (separate operator tier; org RBAC
unchanged) · IV PASS · VII PASS (no self-service signup or billing).
