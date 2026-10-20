# Feature Specification: SSO & Multi-Factor Authentication

**Feature Branch**: `013-sso-mfa`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Single sign-on (Google/Microsoft) plus MFA for password accounts — password-only login is a common blocker for B2B buyers past a certain size."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Employee signs in with their company Google or Microsoft account (Priority: P1)

Instead of a separate password, an employee whose company uses Google Workspace or Microsoft 365
signs into the system using that existing account.

**Why this priority**: This is the actual feature buyers ask for — reduces password-management
burden and lets a company enforce its own identity-provider security policy.

**Independent Test**: Sign in via the Google (or Microsoft) option as a user whose email matches
an existing employee record and confirm they land on their normal role-appropriate dashboard, no
separate password ever entered.

**Acceptance Scenarios**:

1. **Given** an existing employee whose email matches their Google/Microsoft account, **When**
   they choose "sign in with Google/Microsoft," **Then** they are authenticated and reach their
   dashboard without a system password.
2. **Given** a person who authenticates via Google/Microsoft but has no matching employee record,
   **When** they attempt to sign in, **Then** access is refused with a clear message, and no
   account is silently created.
3. **Given** a company that has enabled SSO, **When** HR/Admin views authentication settings,
   **Then** they can see which identity provider is configured.

---

### User Story 2 - HR/Admin enforces SSO for the whole company (Priority: P2)

Once SSO is configured and verified working, HR/Admin can require it — disabling password-based
sign-in for regular employees so the company's identity provider is the single point of control.

**Why this priority**: The enforcement step is what actually delivers the security benefit
buyers want; ranked after P1 because SSO sign-in itself must work first, and a company may
reasonably run both methods side-by-side during rollout.

**Independent Test**: Enable SSO enforcement and confirm a regular employee's password-based
login attempt is refused while SSO sign-in still works; confirm at least one designated
break-glass account can still use a password.

**Acceptance Scenarios**:

1. **Given** SSO enforcement enabled, **When** a regular employee attempts password sign-in,
   **Then** it's refused with guidance to use SSO instead.
2. **Given** SSO enforcement enabled, **When** a designated break-glass Admin account signs in
   with a password, **Then** it succeeds, so the company is never fully locked out if the
   identity provider is unavailable.
3. **Given** HR/Admin, **When** they disable SSO enforcement, **Then** password sign-in becomes
   available again for everyone immediately.

---

### User Story 3 - Password-account user sets up and uses multi-factor authentication (Priority: P1)

A user who still signs in with a password can (or, if HR/Admin requires it, must) add a
second authentication factor — a time-based one-time code from an authenticator app — required
at every sign-in.

**Why this priority**: For any account not on SSO, MFA is the baseline security expectation and
is independently valuable regardless of whether SSO is ever adopted.

**Independent Test**: Enroll MFA on a password account, sign out, and confirm the next sign-in
requires both the password and a valid one-time code, rejecting an incorrect code.

**Acceptance Scenarios**:

1. **Given** a password-account user, **When** they enroll MFA via an authenticator app, **Then**
   subsequent sign-ins require a valid one-time code after the password.
2. **Given** an MFA-enrolled user, **When** they enter the correct password but an incorrect or
   expired one-time code, **Then** sign-in is refused.
3. **Given** HR/Admin, **When** they require MFA company-wide for password accounts, **Then** any
   password-account user without MFA enrolled is prompted to enroll before continuing past their
   next sign-in.
4. **Given** an MFA-enrolled user who loses access to their authenticator, **When** they contact
   HR/Admin, **Then** HR/Admin can reset that user's MFA enrollment, requiring them to re-enroll.

### Edge Cases

- What happens if a company's identity provider is temporarily unavailable while SSO is enforced?
  At least one break-glass account MUST remain able to sign in with a password so the company is
  never completely locked out.
- What happens if an employee's email changes and no longer matches their SSO identity? Sign-in
  MUST fail clearly rather than silently linking to the wrong account.
- What happens if someone attempts to enroll MFA using a code that doesn't correspond to a valid,
  synced authenticator setup? Enrollment MUST fail with a clear retry path, not silently succeed
  with a broken second factor.
- How does the system handle a user attempting many incorrect one-time codes in a row? Repeated
  failed MFA attempts MUST be rate-limited, consistent with the existing login rate-limiting in
  Authentication & RBAC (001).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let HR/Admin configure a company identity provider (Google or
  Microsoft) for single sign-on.
- **FR-002**: System MUST authenticate a user via the configured identity provider and match them
  to an existing employee record by email; it MUST NOT create a new account automatically from an
  SSO login.
- **FR-003**: System MUST refuse SSO sign-in for an authenticated identity-provider account with
  no matching employee record, with a clear message.
- **FR-004**: System MUST let HR/Admin enforce SSO company-wide, disabling password sign-in for
  regular employees.
- **FR-005**: System MUST always allow at least one designated break-glass account to sign in
  with a password even when SSO enforcement is enabled.
- **FR-006**: System MUST let HR/Admin disable SSO enforcement at any time, immediately
  restoring password sign-in availability.
- **FR-007**: System MUST let a password-account user enroll a time-based one-time-code
  authenticator as a second factor.
- **FR-008**: System MUST require a valid second-factor code, in addition to the password, at
  every sign-in for an MFA-enrolled account.
- **FR-009**: System MUST let HR/Admin require MFA enrollment company-wide for all password
  accounts, prompting unenrolled users to enroll before proceeding.
- **FR-010**: System MUST let HR/Admin reset a user's MFA enrollment (e.g., after a lost device),
  requiring that user to re-enroll on next sign-in.
- **FR-011**: System MUST rate-limit repeated failed second-factor attempts against the same
  account.

### Key Entities

- **Identity provider configuration**: The company's SSO setup — which provider, and whether
  enforcement is on.
- **SSO identity link**: The mapping between a User account and its external identity-provider
  identity.
- **MFA enrollment**: A User's second-factor setup — whether enrolled, and enough state to verify
  a submitted one-time code.
- **Break-glass account**: A designated account explicitly allowed to bypass SSO enforcement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with a matching employee record can complete SSO sign-in and reach their
  dashboard in under 10 seconds.
- **SC-002**: Zero cases, during acceptance testing, of an SSO login auto-creating an account for
  an unmatched identity.
- **SC-003**: With SSO enforced, 100% of non-break-glass password sign-in attempts are refused
  during testing.
- **SC-004**: 100% of MFA-enrolled account sign-ins during testing correctly require and validate
  the second factor, with zero successful sign-ins on an incorrect code.
- **SC-005**: The company is never left with zero working sign-in path during testing of SSO
  enforcement — the break-glass account always succeeds.

## Assumptions

- SAML-based enterprise SSO (beyond Google/Microsoft's standard OAuth-based sign-in) is out of
  scope for v1.1; support is limited to those two identity providers.
- SMS-based one-time codes are out of scope for v1.1; MFA is authenticator-app (TOTP) based only.
- Just-in-time account provisioning from SSO (auto-creating an employee record on first SSO
  login) is explicitly excluded — see FR-002 — since employee records are owned by Employee
  Management (002) and created deliberately by HR.
- This feature extends Authentication & RBAC (001) directly; it does not change any RBAC scoping
  rules, only how a user proves their identity before those rules apply.
