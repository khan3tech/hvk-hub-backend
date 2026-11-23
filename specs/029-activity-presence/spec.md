# Feature Specification: Activity & Presence (idle detection, live status, daily activity)

**Feature Branch**: `029-activity-presence`

**Created**: 2026-11-23

**Status**: Draft

**Input**: User description: "A system-active tracker: detect whether an employee is active or idle at their computer, show live status (Active / Away / Offline), give managers and HR a daily activity timeline, and catch idle time while the time tracker's timer is running. Visible to the employee, their manager and HR."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Activity is detected while Hvk Hub is open (Priority: P1)

While an employee has Hvk Hub open, the app reports whether they're active (using keyboard or mouse), idle (no input for the organization's idle threshold), or their screen is locked. Where the browser supports system-wide idle detection and the employee allows it, this covers the whole computer; otherwise it covers activity in Hvk Hub's own window. Only the state is recorded, never what they type, see or use.

**Why this priority**: Everything else (status, timeline, idle prompts) is built on these state reports.

**Independent Test**: Open Hvk Hub, stay active for a few minutes, then leave the keyboard and mouse alone past the threshold, and confirm the employee's own activity view shows an active stretch followed by an idle stretch.

**Acceptance Scenarios**:

1. **Given** an employee with Hvk Hub open, **When** they're using their computer, **Then** their state is recorded as Active about once a minute.
2. **Given** no keyboard or mouse input for the idle threshold (default 5 minutes), **When** the next report is sent, **Then** their state is recorded as Idle; a locked screen is recorded as Locked.
3. **Given** the employee closes Hvk Hub or loses connection, **When** no report arrives for more than 2½ minutes, **Then** they're treated as Offline and no time is recorded for the gap.
4. **Given** the first time an employee opens Hvk Hub with tracking enabled, **When** the app loads, **Then** they see a plain notice of exactly what's tracked and who can see it.
5. **Given** HR has turned tracking off for the organization, **When** the app is open, **Then** nothing is recorded.

---

### User Story 2 - Live presence status (Priority: P1)

Managers and HR see each person's live status (Active, Away, Offline) and when they were last seen, so they know who's available. Employees see their own.

**Why this priority**: It's the "is this person at their desk" answer the user asked for, and needs only Story 1.

**Independent Test**: With one employee active and another not using Hvk Hub, the manager's team view shows the first as Active and the second as Offline with a last-seen time.

**Acceptance Scenarios**:

1. **Given** an employee who reported Active within the last 2½ minutes, **When** their manager views presence, **Then** they're shown as Active.
2. **Given** an employee whose latest report was Idle or Locked, within 2½ minutes, **Then** they're shown as Away.
3. **Given** no report for more than 2½ minutes, **Then** they're shown as Offline with their last-seen time.
4. **Given** an Employee, **When** they request presence, **Then** they only see their own; a Manager sees themselves and direct reports; HR/Admin see everyone.

---

### User Story 3 - Daily activity timeline (Priority: P2)

For any day, an employee can see their own activity as a timeline of active and away stretches with totals: first active, last active, active time and away time. Managers see the same for direct reports; HR/Admin for anyone. A team view lists every visible person's totals for a day.

**Why this priority**: Gives managers and employees the daily picture, but builds on Stories 1–2.

**Independent Test**: After a day with known active and idle stretches, open the timeline and confirm the stretches and totals match.

**Acceptance Scenarios**:

1. **Given** recorded activity on a date, **When** someone allowed to see it opens the timeline, **Then** they see each stretch with its state, start and end, and totals that add up.
2. **Given** a Manager, **When** they request a non-report's timeline, **Then** they're refused.
3. **Given** a Manager or HR, **When** they open the team view for a date, **Then** each visible person is listed with status, first/last active, active and away minutes.

---

### User Story 4 - Idle time while the timer runs (Priority: P2)

If an employee goes idle while a time-tracker timer is running, when they return the app tells them how long they were idle and lets them keep that time or remove it from the running timer.

**Why this priority**: Makes logged time trustworthy, directly using the 028 timer.

**Independent Test**: Start a timer, go idle past the threshold, return, choose "Remove idle time", and confirm the timer's elapsed time dropped by the idle minutes.

**Acceptance Scenarios**:

1. **Given** a running timer and the employee returns after being idle for at least the threshold, **When** they come back, **Then** they're asked to keep or remove the idle minutes.
2. **Given** they choose remove, **When** confirmed, **Then** the timer's start moves later by the idle minutes (never past now), and it keeps running.
3. **Given** they choose keep, **Then** nothing changes.

---

### User Story 5 - HR controls tracking (Priority: P3)

HR/Admin can turn activity tracking on or off for the organization and set the idle threshold (1–60 minutes).

**Acceptance Scenarios**:

1. **Given** HR turns tracking off, **When** employees' apps report, **Then** nothing is stored and presence shows Offline for everyone.
2. **Given** HR changes the threshold to 10 minutes, **When** clients next load settings, **Then** they wait 10 minutes of inactivity before reporting Idle.

### Edge Cases

- Multiple tabs or devices for one employee: reports are merged; at most one report every 20 seconds per employee is recorded.
- Clock tampering: the server's clock decides when each report happened; client timestamps are ignored.
- A report with a state that hasn't changed within 2½ minutes extends the current stretch; a gap longer than that starts a new stretch.
- A stretch that crosses midnight (org time) is split between the two days in totals and timelines.
- Offboarded employees: no new reports are accepted; their history stays visible until it expires.
- Data older than 90 days is deleted automatically.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST accept a state report (Active, Idle or Locked) from a signed-in, active employee and timestamp it with the server's clock.
- **FR-002**: Reports MUST be merged into continuous stretches per state; a report within 150 seconds of the current stretch's end with the same state extends it; a state change within that window starts the new stretch where the previous one ended; a longer gap starts a fresh stretch at the report time.
- **FR-003**: The system MUST ignore reports that arrive less than 20 seconds after the employee's last recorded report.
- **FR-004**: Live status MUST be Active (latest report Active, within 150 s), Away (latest report Idle or Locked, within 150 s), or Offline (no report within 150 s), with the last-seen time.
- **FR-005**: Presence, timelines and team views MUST follow RBAC: employee sees own; Manager sees own and direct reports'; HR/Admin see everyone in the organization.
- **FR-006**: A daily timeline MUST return stretches clipped to the requested org-local date and totals: active minutes, away minutes (Idle + Locked), first active and last active times.
- **FR-007**: A team view MUST return, for a date, each visible active employee's status, last seen, active and away minutes, and first/last active.
- **FR-008**: HR/Admin MUST be able to enable or disable tracking and set the idle threshold (1–60 minutes, default 5); any signed-in user can read these settings.
- **FR-009**: While tracking is disabled, reports MUST NOT be stored, and presence MUST show everyone as Offline.
- **FR-010**: Employees MUST be able to remove a number of minutes from their running timer (028), moving its start time later, capped so the start is never after now.
- **FR-011**: Activity stretches older than 90 days MUST be deleted automatically.
- **FR-012**: The system MUST NOT collect keystrokes, screen contents, screenshots, application names or URLs.
- **FR-013**: The app MUST show employees a notice of what's tracked and who can see it before (or when) tracking starts.
- **FR-014**: All data MUST be scoped to the caller's organization.

### Key Entities

- **Activity Stretch**: a continuous period one employee was in one state (Active, Idle, Locked): start, end.
- **Presence**: an employee's latest state and when it was last reported.
- **Activity Settings**: per organization: enabled, idle threshold minutes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A manager can see who on their team is Active, Away or Offline in one view, accurate to within 3 minutes.
- **SC-002**: Daily active and away totals match the underlying stretches exactly.
- **SC-003**: An employee who returns from being idle with a timer running is offered the idle-time choice 100% of the time when the idle period is at least the threshold.
- **SC-004**: No user can see another person's activity unless their role allows it; zero exceptions in access checks across all four roles.
- **SC-005**: Data older than 90 days is never returned and is removed within one day of expiring.

## Assumptions

- Detection runs in the browser while Hvk Hub is open. System-wide idle and screen-lock detection uses the browser's Idle Detection capability where supported (Chromium browsers) and only after the employee grants permission; otherwise only activity within Hvk Hub's window counts. A desktop agent is out of scope.
- Clients report about once a minute and immediately on state changes.
- Org time zone is Asia/Kolkata, as in 028.
- Retention is fixed at 90 days in this version.
- Tracking is enabled by default for every organization; HR can turn it off.
