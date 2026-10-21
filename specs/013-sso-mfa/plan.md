# Implementation Plan: SSO (Google/Microsoft) & MFA

**Branch**: `feat/remaining-modules` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

New `identity` module:

- **SSO**: Google/Microsoft sign-in via OpenID Connect (authorization code + PKCE). Users are
  matched to existing employees by verified email, never created automatically.
- **Enforcement**: SSO can be enforced company-wide with break-glass Admin accounts as the
  safety valve.
- **MFA**: authenticator-app TOTP, optional or company-required, with HR/Admin reset.

It plugs into 001's password login through a `setLoginPolicy` hook. Backend only.

## Technical Context

- **Migration `sso_mfa`**:
  - IdentityProviderConfig: `provider` becomes nullable, plus `mfaRequired`, `updatedById`,
    `updatedAt`;
  - SsoIdentityLink: `email`, `createdAt`;
  - MfaEnrollment: `secret` becomes nullable, plus `pendingSecret`, `confirmedAt`,
    `failedAttempts`, `lockedUntil`, `lastUsedStep`.
- **New libs**: `lib/totp.ts` (RFC 6238, no dependency) and `lib/secretBox.ts` (AES-256-GCM).
- **Auth changes**: `completeSignIn()` is now the single place sessions are issued, plus
  identity read helpers.
- **Env**: `GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET/TENANT_ID`, `PUBLIC_API_URL`
  (callback base), `PUBLIC_APP_URL` (post-login redirect), and optional `SECRETS_ENCRYPTION_KEY`.

## Research & decisions

- **R1 — Login policy**: after a correct password, the policy decides two things:
  - Password sign-in is blocked (403 `SSO_REQUIRED`) when SSO is enforced and the account isn't
    break-glass (FR-004/005).
  - MFA: an enrolled user gets `VERIFY`; an unenrolled user gets `ENROLL` when MFA is required
    (FR-008/009); otherwise `NONE`.

  Break-glass accounts still verify MFA if they have enrolled.
- **R2 — Two-step sign-in**: when MFA applies, `POST /auth/login` returns
  `{mfaRequired, enrollmentRequired, mfaToken}` and no cookie. The mfaToken is a 5-minute JWT
  signed with a key derived from (but different to) the access secret, so it can never pass as
  an access token. `/auth/mfa/verify` or `/auth/mfa/enroll[/confirm]` finish the sign-in.
- **R3 — TOTP**: SHA1, 30 s, 6 digits, ±1 step of drift. The accepted step is stored, so a
  replay of the same or an older code fails. Five consecutive failures lock MFA for 15 minutes
  (429 `MFA_LOCKED`), on top of an IP rate limit on the public steps (FR-011). Secrets are sealed
  with AES-256-GCM at rest, and the pending secret becomes active only after a matching code
  (edge case).
- **R4 — SSO flow**: `/auth/sso/start` creates state, nonce and a PKCE verifier and stores them
  in a 10-minute signed httpOnly cookie, then redirects to the provider. `/auth/sso/callback`
  checks the state, exchanges the code, and verifies the ID token. The ID token check covers its
  RS256 signature against the provider's published keys (JWKS, cached 1 h), the audience,
  issuer (including the Microsoft tenant) and nonce.
- **R5 — Matching (FR-002/003, SC-002)**: an existing (provider, sub) link must still match the
  user's current email, or sign-in fails with 403 `SSO_EMAIL_MISMATCH` (edge case). Otherwise a
  *verified* email must match an active account, which is then linked; an unknown email gets 403
  `NO_MATCHING_EMPLOYEE` and no account is created. Errors redirect to
  `/login?ssoError=CODE`; success sets the refresh cookie and redirects to `/sso/complete`.
- **R6 — Never locked out (SC-005)**: SSO can't be enforced without a usable break-glass Admin
  (Admin role, active, not locked), and the last one can't be revoked while enforced. Only Admins
  grant break-glass. Disabling enforcement is immediate (FR-006).
- **R7 — Credentials**: provider client secrets come from the environment only. Settings report
  `providerCredentialsConfigured` instead of the secrets.

## Verification note

A real Google/Microsoft round-trip needs live client credentials. The provider calls sit behind
the `OidcProvider` interface: unit tests cover matching, state checks and sign-in with a fake
provider, and the e2e covers settings, enforcement, break-glass and MFA end to end with real TOTP
codes.

## Constitution Check

I PASS (identity owns its tables; reads and writes User only through auth's service; one-way
imports plus the hook) · II PASS · III PASS (RBAC unchanged — identity only gates how sign-in
happens) · IV PASS (ActivityLog for enrollments, resets, settings, break-glass and sign-in method)
· VI PASS · VII PASS (no SAML/SMS; TOTP without a dependency).
