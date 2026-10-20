# Feature Specification: Authentication & Role-Based Access

**Feature Branch**: `001-auth-rbac`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Login, session management, and role-based access control (ADMIN, HR, MANAGER, EMPLOYEE) that every other TeamLoom module depends on."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in and reach a role-appropriate home screen (Priority: P1)

Any employee — from an admin to an individual contributor — signs in with an email and
password and lands on a dashboard that shows only what their role is allowed to see and do.

**Why this priority**: Nothing else in TeamLoom is reachable without this. It is the single
dependency every other module has.

**Independent Test**: Can be fully tested by signing in as each of the four roles and
confirming each sees a different, role-appropriate set of navigation options — delivers value
on its own as a working gate in front of an otherwise empty system.

**Acceptance Scenarios**:

1. **Given** a registered user with valid credentials, **When** they submit email and
   password, **Then** they are signed in and taken to their dashboard.
2. **Given** a registered user, **When** they submit an incorrect password, **Then** they see a
   generic "invalid email or password" message that does not reveal which field was wrong.
3. **Given** a signed-in user, **When** their session is still valid and they reload the page,
   **Then** they remain signed in without re-entering credentials.
4. **Given** a signed-in Manager, **When** they view the navigation, **Then** they see only the
   sections a Manager is permitted to use (their team's data, not company-wide administration).

---

### User Story 2 - Stay signed in across a normal workday without re-authenticating (Priority: P2)

A user's short-lived session is renewed automatically in the background so a workday of
checking in, filing leave, or reviewing candidates isn't interrupted by unexpected sign-outs.

**Why this priority**: Directly affects whether the product feels usable day-to-day; a session
that expires mid-task is a top source of support complaints in HR systems.

**Independent Test**: Sign in, wait past the short-lived session window, then perform an action
— it should succeed transparently instead of bouncing the user to the login screen.

**Acceptance Scenarios**:

1. **Given** a signed-in user whose short-lived session has just expired, **When** they perform
   any action, **Then** their session is renewed automatically and the action completes without
   an extra sign-in.
2. **Given** a user who has been fully signed out (e.g., after 7 days of inactivity), **When**
   they perform an action, **Then** they are redirected to sign in again.

---

### User Story 3 - Be blocked from actions and data outside one's role (Priority: P1)

An Employee cannot view another employee's salary; a Manager cannot approve leave for someone
outside their reporting line; only HR/Admin can create or edit employee records.

**Why this priority**: This is the security backbone of an HR system — a failure here is a data
breach, not a bug. Equal priority to signing in at all.

**Independent Test**: Attempt each restricted action as a role that should not be allowed to
perform it (e.g., an Employee requesting another employee's payslip) and confirm it is refused.

**Acceptance Scenarios**:

1. **Given** an Employee, **When** they request another employee's profile or payslip,
   **Then** the request is refused.
2. **Given** a Manager, **When** they attempt to approve a leave request from someone who is not
   their direct report, **Then** the request is refused.
3. **Given** any authenticated user, **When** they attempt an action reserved for a higher role,
   **Then** they receive a clear "not permitted" response, not a confusing error or blank page.

### Edge Cases

- What happens when a user's account is deactivated (offboarded) while they still hold a valid
  session? The next action they take MUST be refused and they MUST be signed out.
- How does the system handle a login attempt with an email that doesn't exist? It MUST return
  the same generic invalid-credentials message as a wrong password, so account existence isn't
  leakable by trying emails.
- What happens on repeated failed login attempts for the same account? The account MUST be
  locked after a threshold of consecutive failures, and MUST stay locked until an Admin or HR
  user manually unlocks it — there is no automatic time-based unlock.
- What happens when a locked-out user attempts to sign in with correct credentials? They MUST
  still be refused, with a message indicating the account is locked and to contact an
  administrator (not the generic invalid-credentials message).
- What happens when a Manager who approves leave is later removed as someone's reporting
  manager? Their access to that person's data MUST be re-evaluated on the next request, not
  cached from before the change.
- What happens when a Manager's own account is deactivated while their direct reports still
  reference them as manager? This spec's RBAC scoping MUST treat a dangling manager reference as
  "no direct reports" rather than erroring; reassigning those reports to a new manager is out of
  scope here and is owned by the Employee Management feature (002).

## Clarifications

### Session 2026-09-13

- Q: When repeated failed sign-in attempts trigger the rate limit in FR-011, what should actually happen to the account? → A: Hard lockout after N failures until an Admin/HR manually unlocks the account
- Q: Who is allowed to unlock a locked account, and does unlocking need its own audited action? → A: Admin + HR only, using existing edit-account permissions; unlock action is written to the audit/activity log
- Q: When a Manager's account is deactivated while their direct reports still list them as manager, what should happen to those reports' "manager" field? → A: Out of scope for this spec — defer reassignment to Employee Management (002); this spec's RBAC scoping must treat a dangling manager reference as "no direct reports," not an error

### Session 2026-09-14

- Q: How many consecutive failed sign-in attempts should lock an account? (FR-011) → A: 3 consecutive failed attempts
- Q: Should a user be allowed more than one active session at a time (e.g., laptop + phone)? → A: No — single active session only; signing in on a new device ends the previous session

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let a user sign in with email and password and reject invalid
  credentials with a generic, non-revealing error message.
- **FR-002**: System MUST keep a signed-in user's session valid across normal use without
  requiring re-entry of credentials more than once per 7 days of continued activity.
- **FR-003**: System MUST let a user explicitly sign out, immediately invalidating their
  session.
- **FR-004**: System MUST assign every user exactly one role: Admin, HR, Manager, or Employee.
- **FR-005**: System MUST restrict every action and every piece of data in every other module to
  the roles and scopes defined in the RBAC matrix (see Assumptions) — enforced regardless of
  which screen or entry point the request comes from.
- **FR-006**: System MUST scope a Manager's access to their own direct reports (and, for
  recruitment, their own department), not the whole company.
- **FR-007**: System MUST scope an Employee's access to their own records only.
- **FR-008**: System MUST let HR and Admin view and manage records across the whole
  organization.
- **FR-009**: System MUST record who signed in, from where (at minimum, when), for security
  review purposes.
- **FR-010**: System MUST revoke a user's access immediately upon their employee record being
  marked offboarded.
- **FR-011**: System MUST rate-limit repeated failed sign-in attempts against the same account. After 3 consecutive failed attempts, the account MUST be locked and remain locked until an Admin or HR user manually unlocks it (no automatic time-based unlock).
- **FR-012**: System MUST restrict unlocking a locked account to Admin and HR users (the same roles already permitted to edit employee/account records), and MUST record the unlock as an audited action.
- **FR-013**: System MUST allow only one active session per user. Signing in successfully on a new device or browser MUST invalidate any previously active session for that user.

### Key Entities

- **User**: A login identity — email, credential, assigned role, and a link to the Employee
  record it represents (an Admin/HR user may exist without a linked Employee record in edge
  cases such as a system administrator).
- **Role**: One of Admin, HR, Manager, Employee. Determines the default scope of what a User can
  see and do; a Manager's *effective* scope is further narrowed by their reporting-line
  relationships in the Employee Management feature.
- **Session**: The proof that a User is currently signed in, with a short renewal window and a
  longer absolute expiry after which re-authentication is required. Only one Session may be
  active per User at a time; a new successful sign-in invalidates the previous Session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from opening the login page to a fully rendered, role-appropriate
  dashboard in under 5 seconds on a normal connection.
- **SC-002**: Zero observed cases, across all four roles, of a user reaching data or an action
  outside their defined scope during acceptance testing of the RBAC matrix.
- **SC-003**: A user performing normal daily tasks (check-in, leave request, reviewing a
  candidate) is never interrupted by an unexpected forced sign-out within a single 8-hour
  workday of continuous activity.
- **SC-004**: 100% of restricted actions attempted by an under-privileged role during testing
  are refused with a clear, non-technical message.

## Assumptions

- Sign-up/self-registration is out of scope — accounts are created by HR/Admin as part of the
  Employee Management feature; this feature covers signing in to an existing account only.
- Password reset via email is assumed necessary but its detailed flow (reset-link delivery,
  expiry) is deferred to its own follow-up spec rather than detailed here.
- Single sign-on (SSO) / social login is out of scope for v0.1.
- The RBAC matrix referenced by FR-005 is: Create/edit employee records (Admin+HR only); View
  employee records (Admin+HR: all, Manager: team, Employee: self); Check-in/leave request (all:
  self); Approve/reject leave (Admin+HR: all, Manager: direct reports); Edit salary structure
  (Admin+HR only); Run payroll / view payslips (Admin+HR: all, Manager: team view-only, Employee:
  own view-only); Create job posting / move pipeline stage (Admin+HR: all, Manager: own
  department, view + interview feedback).
- Multi-company/tenant support is out of scope for v0.1; the system operates for a single
  organization.
