# Feature Specification: Mobile App / Progressive Web App

**Feature Branch**: `019-mobile-pwa`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Check-in/out, leave requests, and approvals from a phone — the highest-frequency actions in the system currently assume a desk and a browser tab."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Employee checks in and out from their phone (Priority: P1)

An employee opens the app on their phone — installed to their home screen like a native app —
and checks in or out in one tap, without needing a laptop.

**Why this priority**: Check-in/out (Attendance & Leave, 003) is the single highest-frequency
action in the whole system; making it phone-first delivers the most value per effort of anything
in this feature.

**Independent Test**: Install the app to a phone's home screen, open it, and complete a check-in
and check-out, confirming both are recorded identically to a desktop check-in.

**Acceptance Scenarios**:

1. **Given** a phone browser, **When** a user visits the app, **Then** they're prompted to
   install it to their home screen for app-like access.
2. **Given** the installed app, **When** an employee opens it and checks in, **Then** the
   action completes in one tap and matches the record a desktop check-in would produce.
3. **Given** a phone with a small screen, **When** an employee views their attendance history,
   **Then** the layout remains fully usable without horizontal scrolling for primary actions.

---

### User Story 2 - Employee files and Manager approves leave from a phone (Priority: P1)

An employee files a leave request from their phone, and a Manager reviews and approves or
rejects pending requests from their phone too, without needing to be at a desk to unblock their
team.

**Why this priority**: Leave approval delays are one of the most common complaints in HR
systems, and Managers are disproportionately likely to be away from a desk (in meetings, in the
field) when a decision is needed — mobile approval directly removes that bottleneck.

**Independent Test**: File a leave request from a phone, then approve it from a different
phone-session Manager account, confirming both actions behave identically to their desktop
equivalents.

**Acceptance Scenarios**:

1. **Given** a phone, **When** an employee files a leave request, **Then** it's created
   identically to a desktop-filed request and enters the same approval workflow.
2. **Given** a phone, **When** a Manager opens their approval queue, **Then** they see the same
   pending requests visible on desktop, and can approve or reject with the same outcomes.
3. **Given** a low-connectivity moment (e.g., a brief network drop mid-approval), **When** the
   action is retried, **Then** the system does not create a duplicate approval/rejection from the
   retry.

---

### User Story 3 - Employee receives and acts on a push notification (Priority: P2)

An employee gets a push notification on their phone for a high-value event (their leave was
decided, they were assigned an interview) and tapping it takes them directly to the relevant
screen in the app.

**Why this priority**: Extends Notifications (006) to a channel people are far more likely to
see promptly than email or an in-app badge they have to remember to check; valuable but not
required for the core mobile check-in/leave value already delivered by P1.

**Independent Test**: Trigger a leave decision while a test device has the app installed with
notifications enabled, and confirm a push notification arrives and opens directly to that leave
request.

**Acceptance Scenarios**:

1. **Given** an installed app with notifications enabled, **When** a notifiable event occurs for
   that user (per Notifications, 006), **Then** a push notification is delivered to their device.
2. **Given** a delivered push notification, **When** the user taps it, **Then** the app opens
   directly to the relevant record, not just the app's home screen.
3. **Given** a user who has not enabled notifications, **When** a notifiable event occurs,
   **Then** the in-app notification center (006) still reflects it — push is additive, not a
   replacement channel.

### Edge Cases

- What happens when the phone has no network connectivity at the moment of a check-in attempt?
  The action MUST fail clearly with a retry option rather than silently appearing to succeed.
- What happens if a user installs the app on multiple devices? Each device MUST behave
  independently — signing out of one MUST NOT affect the others' sessions.
- What happens when the app is opened on a very old or unsupported mobile browser? The system
  MUST degrade to a usable, if less polished, experience rather than a blank or broken page.
- How does the system handle push-notification permission being denied or later revoked by the
  user? The rest of the app MUST continue functioning fully — push is an enhancement, never a
  requirement for core actions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST be installable to a phone's home screen as a Progressive Web App,
  usable without going through an app store.
- **FR-002**: System MUST provide full check-in/check-out functionality on mobile, behaviorally
  identical to the desktop equivalent from Attendance & Leave (003).
- **FR-003**: System MUST provide full leave-request filing and leave-approval-queue
  functionality on mobile, behaviorally identical to the desktop equivalent.
- **FR-004**: System MUST render every primary mobile screen (check-in, leave, approvals,
  notifications) usably on small screens without horizontal scrolling for core actions.
- **FR-005**: System MUST prevent a retried action caused by a network interruption (e.g., an
  approval submitted twice due to a dropped connection) from creating a duplicate effect.
- **FR-006**: System MUST let a user opt into push notifications and, when enabled, deliver a
  push notification for each event type defined in Notifications (006).
- **FR-007**: System MUST open the relevant record directly when a user taps a push notification,
  not just the app's default screen.
- **FR-008**: System MUST continue to fully function for a user who declines or later revokes
  push-notification permission.
- **FR-009**: System MUST support multiple independent device sessions per user, where signing
  out of one device does not sign out another.
- **FR-010**: System MUST clearly indicate to the user when an action failed due to lack of
  connectivity, with a way to retry.

### Key Entities

This feature introduces no new HR domain data — it is a delivery channel over existing
Attendance & Leave (003) and Notifications (006) data:

- **Device registration**: A record linking a user to a device/browser instance for push-
  notification delivery, separate from that user's authentication session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An employee can complete a check-in on a phone in under 5 seconds from opening the
  installed app.
- **SC-002**: A Manager can approve a pending leave request from a phone in under 15 seconds from
  opening the app.
- **SC-003**: Zero duplicate approvals/rejections observed during acceptance testing of
  retried actions under simulated network interruption.
- **SC-004**: A push notification for a leave decision is delivered and opens directly to the
  correct record in under 1 minute of the decision being made, during testing.
- **SC-005**: Core actions (check-in, leave filing, approvals) remain fully functional during
  testing with push-notification permission denied.

## Assumptions

- This is delivered as a responsive, installable Progressive Web App rather than separate native
  iOS/Android app-store builds for v1.2 — no app-store review process or native-only APIs are
  required.
- Offline-first functionality (queuing actions taken with zero connectivity for later sync) is a
  reasonable future extension but not required for v1.2; a network-required action simply fails
  clearly and can be retried once connectivity returns.
- Biometric device-level unlock (Face ID/fingerprint) to open the app faster is a nice-to-have,
  not a functional requirement, for this pass.
- Depends on Attendance & Leave (003) and Notifications (006) for the functionality it delivers
  on mobile; introduces no independent business logic of its own.
