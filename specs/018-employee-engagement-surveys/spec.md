# Feature Specification: Employee Engagement & Pulse Surveys

**Feature Branch**: `018-employee-engagement-surveys`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "eNPS and anonymous sentiment tracking — short, recurring pulse surveys instead of no structured way to hear how employees feel."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR launches a pulse survey to some or all employees (Priority: P1)

HR/Admin creates a short survey (a handful of questions, at least one being a standard 0–10
eNPS-style question) and sends it to a chosen audience — the whole company or a specific
department.

**Why this priority**: Nothing else in the feature is possible without a survey to launch — this
is the foundation.

**Independent Test**: Create a survey with one eNPS question and one open-text question, send it
to a test group, and confirm it appears as pending for each recipient in that group.

**Acceptance Scenarios**:

1. **Given** HR/Admin, **When** they create a survey with at least one question and choose an
   audience, **Then** it's sent and appears as pending for every employee in that audience.
2. **Given** a survey targeting one department, **When** it's sent, **Then** only employees in
   that department see it as pending; everyone else is unaffected.
3. **Given** an employee joining after a survey was already sent, **When** their record is
   created, **Then** they do not retroactively receive that already-sent survey.

---

### User Story 2 - Employee responds anonymously (Priority: P1)

An employee completes a pending survey, and their individual response is not attributable back
to them in anything HR can see — only aggregated results are ever visible.

**Why this priority**: Anonymity is the entire premise of honest sentiment data — a survey
without it collects far less truthful input and is a fundamentally different (and much less
valuable) feature.

**Independent Test**: Submit a response as a test employee, then confirm that HR's results view
shows the response only as part of an aggregate, with no way to trace it back to that individual
account, even to an Admin.

**Acceptance Scenarios**:

1. **Given** a pending survey, **When** an employee submits their response, **Then** it's
   recorded without a stored link between that response and their identity.
2. **Given** a completed survey with multiple responses, **When** HR/Admin (including Admin)
   views results, **Then** they see aggregated scores and anonymized open-text responses, never
   a per-person breakdown.
3. **Given** a survey audience small enough that aggregation alone might make a response
   identifiable (e.g., two people in a department), **When** HR/Admin views results for that
   group, **Then** the system withholds the breakdown until a minimum response-count threshold is
   met, showing "not enough responses to display" instead.

---

### User Story 3 - HR sees eNPS trend and completion rate over time (Priority: P2)

HR/Admin sees how the company's eNPS score has moved across successive surveys, and what
proportion of each audience actually responded.

**Why this priority**: A single survey's aggregate result (P1) is already useful; the trend and
completion-rate view is the layer that turns one-off snapshots into an ongoing engagement signal.

**Independent Test**: Run two surveys over time with known scores and confirm the trend view
correctly plots both and reports response rate for each.

**Acceptance Scenarios**:

1. **Given** two or more completed surveys, **When** HR/Admin views the trend, **Then** the
   eNPS score for each is plotted in chronological order.
2. **Given** a completed survey, **When** HR/Admin views its response rate, **Then** it correctly
   reflects responses received divided by audience size.
3. **Given** a survey still open for responses, **When** HR/Admin views it, **Then** it's clearly
   distinguished from completed (closed) surveys in any trend or listing view.

### Edge Cases

- What happens if the minimum response-count threshold (User Story 2) is never met for a small
  group's survey? Results for that group MUST remain permanently withheld as "not enough
  responses," never falling back to showing a small, potentially identifying breakdown.
- What happens if an employee starts a survey but doesn't finish it? Partial responses MUST NOT
  be counted toward completion or included in aggregated results unless the employee explicitly
  submits.
- What happens if HR needs to correct a mistake after a survey has already gone out (e.g., a typo
  in a question)? Once sent, a survey's questions MUST NOT be editable — a correction requires
  closing it and sending a new one, to keep every response comparable to the same question text.
- How does the system prevent an employee from responding to the same survey twice? A second
  submission attempt MUST be refused once a response is recorded for that employee/survey pair,
  even though the system does not store who that response belongs to.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let HR/Admin create a survey with one or more questions, including at
  least a standard 0–10 eNPS-style question type and an open-text question type.
- **FR-002**: System MUST let HR/Admin choose a survey's audience as the whole company or a
  specific department.
- **FR-003**: System MUST NOT retain any stored link between a submitted response and the
  identity of the employee who submitted it.
- **FR-004**: System MUST prevent a second response submission for the same employee/survey pair
  without needing to identify who already responded.
- **FR-005**: System MUST withhold a group's aggregated results until a minimum response-count
  threshold is met, showing a clear "not enough responses" state below that threshold.
- **FR-006**: System MUST NOT allow a survey's questions to be edited once it has been sent;
  corrections require closing it and creating a new survey.
- **FR-007**: System MUST compute and display an aggregate eNPS score (promoters minus
  detractors) for each completed survey meeting the minimum response threshold.
- **FR-008**: System MUST show HR/Admin a trend of eNPS scores across successive completed
  surveys, in chronological order.
- **FR-009**: System MUST show HR/Admin each survey's response rate (responses received ÷
  audience size).
- **FR-010**: System MUST NOT send a survey to an employee who joins after that survey was
  already sent.

### Key Entities

- **Survey**: A set of questions, an audience definition, a status (open/closed), and send date.
- **Survey question**: One question on a survey — type (eNPS-style score, open text) and prompt.
- **Survey response**: One anonymous submission against one survey — answers to each question,
  with no stored identity link.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: HR can launch a new survey to a chosen audience in under 5 minutes.
- **SC-002**: An employee can complete a typical pulse survey in under 2 minutes.
- **SC-003**: Zero cases, across acceptance testing (including database-level inspection), of a
  submitted response being traceable back to the submitting employee.
- **SC-004**: 100% of small-audience results below the minimum response threshold correctly show
  "not enough responses" rather than a potentially identifying breakdown.
- **SC-005**: HR can view eNPS trend across at least three completed surveys in a single view, in
  under 15 seconds.

## Assumptions

- The minimum response-count threshold for showing aggregated results is configurable but
  defaults to a small-group-safe value (e.g., 5) rather than 1, prioritizing anonymity over
  granularity.
- Custom, HR-defined question types beyond eNPS-score and open-text (e.g., multiple choice) are a
  reasonable future extension but not required for v1.2's initial pass.
- Recurring/scheduled surveys (e.g., "send this automatically every quarter") are out of scope
  for v1.2; each survey is manually created and sent.
- Depends on Employee Management (002) for audience membership (whole company / department) and
  Authentication & RBAC (001) for HR/Admin-only survey creation; functions independently of every
  other v1.1/v1.2 feature.
