# Tasks: SSO & MFA

**Input**: plan.md, contracts/identity-api.md, quickstart.md. Backend only.

## Phase 1: Setup
- [X] T001 Migration `sso_mfa`; `lib/totp.ts` (RFC 6238); `lib/secretBox.ts` (AES-256-GCM)
- [X] T002 Auth: `setLoginPolicy` hook, MFA challenge from login, `completeSignIn`, identity read/write helpers

## Phase 2: US3 — MFA (P1)
- [X] T003 Enrollment (pending → confirmed with a matching code), self-service and from the challenge (FR-007)
- [X] T004 Challenge verification with drift window, replay block, 5-failure lock + IP limiter (FR-008/011)
- [X] T005 Company-wide MFA requirement → forced enrollment (FR-009); HR/Admin reset (FR-010)

## Phase 3: US1 — SSO sign-in (P1)
- [X] T006 OIDC provider adapter (Google/Microsoft): auth URL with PKCE, code exchange, JWKS-verified ID token
- [X] T007 Start/callback with a signed state cookie; verified-email matching, no account creation (FR-002/003); settings view (US1.3)

## Phase 4: US2 — Enforcement (P2)
- [X] T008 Enforce/disable SSO (FR-004/006); break-glass Admins with lockout guards (FR-005, SC-005)

## Phase 5: Polish
- [X] T009 Unit tests (15, incl. RFC 6238 vectors); `scripts/e2e/013-identity.mjs` (24 checks, settings restored in finally)
