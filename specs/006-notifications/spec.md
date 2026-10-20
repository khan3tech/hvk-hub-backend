# Feature Specification: Notifications

**Feature Branch**: `006-notifications`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Email and in-app notifications for the events that currently only exist inside the app — leave decisions, payroll runs, interview schedules — so people find out without having to go look."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Employee is notified the moment their leave request is decided (Priority: P1)

An Employee who filed a leave request gets an email and an in-app notification the moment a
Manager or HR approves or rejects it, instead of finding out only by re-opening the leave page.

**Why this priority**: This is the single most common "did anything happen" question in an HR
system and the clearest case where silence looks like a bug.

**Independent Test**: File a leave request, approve it from another account, and confirm the
requester receives both an email and an in-app notification within a minute, containing the
decision and (if rejected) the reason.

**Acceptance Scenarios**:

1. **Given** a pending leave request, **When** it is approved, **Then** the requester receives
   an in-app notification and an email stating the decision and the approved dates.
2. **Given** a pending leave request, **When** it is rejected with a reason, **Then** the
   requester receives an in-app notification and an email including that reason.
3. **Given** a Manager with pending requests in their queue, **When** a new leave request is
   filed by one of their direct reports, **Then** the Manager receives an in-app notification
   prompting review.

---

### User Story 2 - Employee sees an in-app notification center (Priority: P1)

Any employee can open a single place in the app to see their recent notifications, whether or
not they acted on the underlying email, and mark them read.

**Why this priority**: Email alone is not sufient — some users work inside the app all day and
never check email; an in-app feed is the P1 delivery channel, email is the reinforcement.

**Independent Test**: Trigger any notifiable event, then open the notification center and
confirm the item appears, unread, and can be marked read.

**Acceptance Scenarios**:

1. **Given** a user with unread notifications, **When** they open the notification center,
   **Then** they see each one with a timestamp and a link to the relevant record.
2. **Given** an unread notification, **When** the user opens or dismisses it, **Then** it's
   marked read and no longer counts toward their unread badge.
3. **Given** a user with zero notifications, **When** they open the notification center,
   **Then** they see a clear empty state, not an error.

---

### User Story 3 - HR/Admin and interview participants are notified of payroll and recruitment events (Priority: P2)

HR/Admin get notified when a payroll run finishes (including which employees were skipped), and
an interviewer gets notified when they're assigned an interview round.

**Why this priority**: Extends the same mechanism to the other two modules with time-sensitive
events; ranked after leave (P1) because payroll runs and interview scheduling are lower-frequency
events than leave decisions.

**Independent Test**: Run payroll and confirm HR/Admin get a completion notification listing any
skipped employees; schedule an interview and confirm the assigned interviewer is notified.

**Acceptance Scenarios**:

1. **Given** a payroll run that just completed, **When** it finishes, **Then** the HR/Admin user
   who triggered it receives a notification summarizing how many payslips were generated and
   listing any employees skipped.
2. **Given** an interview round just scheduled, **When** it's created, **Then** the assigned
   interviewer receives a notification with the application, date, and time.
3. **Given** an interview round's result is recorded, **When** it's saved, **Then** HR/Admin and
   the relevant department Manager are notified.

### Edge Cases

- What happens if a user's email address bounces or is invalid? The in-app notification MUST
  still be created regardless of email delivery success or failure.
- What happens when the same event would notify a large number of people at once (e.g., a
  company-wide holiday added)? The system MUST NOT be required to notify everyone for every
  event type — only the events listed in the Functional Requirements below generate
  notifications for v1.1.
- What happens if a user has no linked email (edge-case system accounts)? They MUST still
  receive the in-app notification; email sending is simply skipped for that user.
- How does the system handle a burst of many events in a short time (e.g., a payroll run
  generating one event per employee)? Per-employee events (like a payslip becoming available)
  MUST NOT flood the notification center — see Assumptions for the batching default.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST notify (in-app and email) the employee who filed a leave request when
  it is approved or rejected.
- **FR-002**: System MUST notify (in-app) a Manager when a new leave request from one of their
  direct reports needs their decision.
- **FR-003**: System MUST notify (in-app and email) the HR/Admin user who triggered a payroll
  run when it completes, including a count of payslips generated and a list of any employees
  skipped.
- **FR-004**: System MUST notify (in-app and email) an employee assigned as an interviewer when
  an interview round is scheduled for them.
- **FR-005**: System MUST notify (in-app) HR/Admin and the relevant department Manager when an
  interview round's result is recorded.
- **FR-006**: System MUST provide every authenticated user an in-app notification center showing
  their own notifications, newest first, each with a timestamp, a short description, and a link
  to the relevant record.
- **FR-007**: System MUST let a user mark an individual notification read, and MUST show an
  unread count somewhere persistently visible in the app shell.
- **FR-008**: System MUST continue creating the in-app notification for a user even if that
  user's email fails to send.
- **FR-009**: System MUST NOT send an email notification to an offboarded employee.
- **FR-010**: System MUST let a user access a rejected leave request's reason, a skipped payroll
  employee's cause, and an interview's scheduled time directly through the notification's link.

### Key Entities

- **Notification**: One event delivered to one user — type, short message, a link to the source
  record, read/unread state, and a timestamp.
- **Notification event**: The underlying trigger (leave decided, leave filed for a manager,
  payroll run completed, interview scheduled, interview result recorded) that fans out to one or
  more Notifications.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user is notified of a leave decision affecting them within 1 minute of that
  decision being made, through at least one channel (in-app), every time, during acceptance
  testing.
- **SC-002**: 100% of in-app notifications are created successfully regardless of whether the
  corresponding email send succeeds or fails.
- **SC-003**: A user can find and open any notification from the last 30 days from a single
  notification center, in under 10 seconds.
- **SC-004**: Zero notifications are ever sent to an offboarded employee's email address during
  acceptance testing.

## Assumptions

- Push notifications (mobile) are out of scope for v1.1 — email and in-app only.
- Per-user notification preferences (opting out of specific event types) are out of scope for
  v1.1; every user receives every notification type relevant to their role.
- High-volume per-employee events from a single payroll run are summarized as one notification
  to the triggering HR/Admin user rather than one notification per employee, to avoid flooding
  the notification center.
- SMS notifications are out of scope for v1.1.
- This feature depends on Authentication & RBAC (001) for the user/employee link used to route
  notifications, and touches Attendance & Leave (003), Payroll (004), and Recruitment/ATS (005)
  as the event sources.
