# Feature Specification: HR Helpdesk / Ticketing

**Feature Branch**: `017-hr-helpdesk-ticketing`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Employees raise HR queries ('update my bank details,' 'payslip issue') as tracked tickets instead of side-channel Slack/email, so nothing gets lost and HR has a queue instead of a scattered inbox."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Employee raises a ticket (Priority: P1)

An Employee has an HR question or request that isn't self-service elsewhere in the system, and
raises it as a ticket under a category, instead of emailing or messaging HR directly.

**Why this priority**: Nothing else in the feature exists without a way to open a ticket — this
is the entry point the whole feature depends on.

**Independent Test**: Raise one ticket under a category (e.g., "Payroll query") with a
description, and confirm it appears in HR's queue as open, unassigned.

**Acceptance Scenarios**:

1. **Given** an Employee, **When** they raise a ticket with a category and description, **Then**
   it appears in the HR queue as open.
2. **Given** a raised ticket, **When** the Employee views their own tickets list, **Then** they
   see its current status and any HR replies.
3. **Given** an Employee raising a ticket, **When** they select a category, **Then** the list of
   categories reflects common HR query types (e.g., payroll, leave, personal details, general)
   configured by HR/Admin.

---

### User Story 2 - HR triages, responds to, and resolves tickets (Priority: P1)

HR/Admin sees an incoming queue of tickets, assigns them (to themselves or another HR team
member), replies, and marks them resolved once handled.

**Why this priority**: This is the operational core — a ticket that can be raised but never
worked is no better than an ignored inbox.

**Independent Test**: Assign an open ticket to an HR user, post a reply, and mark it resolved —
confirm the requesting Employee sees the reply and the resolved status.

**Acceptance Scenarios**:

1. **Given** an open, unassigned ticket, **When** an HR/Admin user assigns it to themselves or a
   colleague, **Then** it's reflected as assigned in the queue.
2. **Given** an assigned ticket, **When** HR posts a reply, **Then** the Employee sees it on
   their ticket immediately.
3. **Given** a ticket that's been addressed, **When** HR marks it resolved, **Then** its status
   updates and it moves out of the active queue view by default.
4. **Given** a resolved ticket, **When** the original Employee has a follow-up, **Then** they can
   reopen it rather than being forced to raise a brand-new ticket.

---

### User Story 3 - HR sees ticket volume and response-time visibility (Priority: P2)

HR/Admin views a simple overview of ticket volume by category and how long tickets are taking to
resolve, so recurring pain points and slow response areas are visible.

**Why this priority**: Operational insight layered on top of P1's working queue; valuable at
scale, not required for the queue itself to function.

**Independent Test**: With a mix of resolved and open tickets across categories, open the
overview and confirm counts and average resolution time per category match the underlying ticket
records.

**Acceptance Scenarios**:

1. **Given** tickets across multiple categories, **When** HR/Admin views the overview, **Then**
   they see open/resolved counts per category.
2. **Given** resolved tickets with known open and close timestamps, **When** HR/Admin views
   average resolution time, **Then** the figure matches manual calculation.
3. **Given** tickets open longer than a configured threshold, **When** HR/Admin views the queue,
   **Then** those are flagged as overdue.

### Edge Cases

- What happens if an Employee raises a ticket about another employee's personal data (e.g., "why
  hasn't my direct report's leave been approved")? The system MUST NOT let the ticket itself
  expose data the requester isn't otherwise entitled to see — the ticket is a request channel,
  not an access-control bypass.
- What happens if an employee is offboarded while they have open tickets? HR MUST retain visibility
  into those tickets for record-keeping; the employee's own portal access to reply is naturally
  revoked with their account per Authentication & RBAC (001).
- What happens if a ticket sits unassigned past a reasonable time? It MUST be visually flagged in
  the queue so it doesn't silently age out of attention.
- What happens if a Manager raises a ticket on behalf of a direct report? v1.2 supports only
  self-service ticket creation (an employee raises their own); a Manager raising on someone
  else's behalf is deferred (see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let any authenticated Employee raise a ticket with a category and
  description.
- **FR-002**: System MUST maintain a configurable list of ticket categories, editable by
  HR/Admin.
- **FR-003**: System MUST let HR/Admin view an incoming queue of all tickets, filterable by
  status and category.
- **FR-004**: System MUST let HR/Admin assign a ticket to themselves or another HR team member.
- **FR-005**: System MUST let an assigned HR user post replies visible to the requesting
  Employee.
- **FR-006**: System MUST let HR/Admin mark a ticket resolved, and let the requesting Employee
  reopen a resolved ticket rather than requiring a new one.
- **FR-007**: System MUST let an Employee view the status and reply history of their own tickets
  only.
- **FR-008**: System MUST NOT expose, through a ticket, any data the requester would not
  otherwise be entitled to view or act on elsewhere in the system.
- **FR-009**: System MUST flag a ticket as overdue once it has remained open past a configured
  threshold without HR action.
- **FR-010**: System MUST provide HR/Admin a summary view of open/resolved ticket counts per
  category and average resolution time.
- **FR-011**: System MUST retain a ticket's full history for HR/Admin visibility even after the
  requesting employee is offboarded.

### Key Entities

- **Ticket**: An employee's HR request — category, description, status (open/assigned/resolved/
  reopened), assignee, and a reply thread.
- **Ticket category**: A configurable classification (e.g., payroll, leave, personal details,
  general) tickets are raised under.
- **Ticket reply**: One message in a ticket's thread, from either the requester or HR.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An Employee can raise a ticket in under 1 minute.
- **SC-002**: HR can triage (assign) a new ticket in under 30 seconds from the queue view.
- **SC-003**: 100% of tickets past the overdue threshold are visibly flagged during acceptance
  testing, with zero missed cases.
- **SC-004**: HR can determine average resolution time per category without manually
  cross-referencing individual tickets, in under 15 seconds.
- **SC-005**: Zero cases, during testing, of ticket content exposing data the requester was not
  independently entitled to see.

## Assumptions

- A Manager raising a ticket on behalf of a direct report, and public (non-authenticated) ticket
  submission, are both out of scope for v1.2 — tickets are self-service and require an existing
  account.
- Ticket-driven automated actions (e.g., a "update my bank details" ticket automatically changing
  payroll data) are explicitly out of scope — HR still makes the actual data change through the
  relevant module (e.g., Payroll, 004); the ticket only tracks the request and conversation.
- Live chat / real-time messaging is out of scope for v1.2; replies are asynchronous, page-refresh
  or notification-driven (pairs naturally with Notifications, 006).
- Depends on Authentication & RBAC (001) for who can raise/see which tickets; has no dependency on
  any other v1.1/v1.2 feature to function.
