# Feature Specification: Attendance & Leave

**Feature Branch**: `003-attendance-leave`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Daily check-in/out, leave types and balances, a manager approval workflow, and a company holiday calendar."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Employee checks in and out for the day (Priority: P1)

An Employee marks the start and end of their working day with a single action each, and can see
today's status at a glance.

**Why this priority**: Daily attendance is the highest-frequency interaction in the whole
system — every employee, every working day.

**Independent Test**: Check in, then check out, and confirm the day's record shows both times
and a computed status — delivers value standalone as a working time log even before leave or
payroll exist.

**Acceptance Scenarios**:

1. **Given** an Employee who hasn't checked in today, **When** they check in, **Then** today's
   record shows a check-in time and their status updates to "checked in."
2. **Given** an Employee who has checked in today, **When** they check out, **Then** today's
   record shows both times and total hours for the day.
3. **Given** an Employee who has already checked in today, **When** they try to check in again,
   **Then** the system prevents a duplicate check-in for the same day.
4. **Given** any employee, **When** they view their attendance history, **Then** they see a
   calendar or list of past days with status (present, absent, on leave, holiday).

---

### User Story 2 - Employee requests leave and tracks their balance (Priority: P1)

An Employee sees how many days of each leave type they have left, files a request for specific
dates, and can track whether it's pending, approved, or rejected.

**Why this priority**: Leave requests are the second-most frequent interaction and the one most
likely to cause a support complaint if balances are wrong or requests get lost.

**Independent Test**: File a leave request as an Employee and confirm it appears with "pending"
status and their balance is unaffected until a decision is made — delivers value even before an
approver acts, by making the ask/status visible.

**Acceptance Scenarios**:

1. **Given** an Employee with an available leave balance, **When** they request leave for a date
   range within that balance, **Then** the request is created with "pending" status and does not
   yet change their balance.
2. **Given** an Employee, **When** they request more days than their remaining balance for that
   leave type, **Then** the system blocks the request and explains the shortfall.
3. **Given** an Employee, **When** they view their leave history, **Then** they see every past
   and pending request with its current status.
4. **Given** an Employee, **When** they request leave for a date that overlaps a company holiday
   or an existing approved leave request, **Then** the system flags the overlap before
   submission.

---

### User Story 3 - Manager (or HR/Admin) reviews and decides on leave requests (Priority: P1)

A Manager sees a queue of pending leave requests from their direct reports and approves or
rejects each with one action; HR/Admin can do the same for anyone in the company.

**Why this priority**: Without an approval step, "leave" is just an unactioned wishlist — this
is what makes the feature functionally complete.

**Independent Test**: As a Manager, approve one pending request from a direct report and confirm
the requester's balance decreases and their status updates to "approved" — reject another and
confirm their balance is untouched.

**Acceptance Scenarios**:

1. **Given** a Manager with a pending leave request from a direct report, **When** they approve
   it, **Then** the request status becomes "approved," the requester's leave balance is
   decremented by the requested days, and the change is visible to the requester immediately.
2. **Given** a Manager, **When** they reject a pending request with a reason, **Then** the status
   becomes "rejected," the reason is visible to the requester, and their balance is unchanged.
3. **Given** a Manager, **When** they view their approval queue, **Then** they see only requests
   from their own direct reports, not the whole company.
4. **Given** an already-approved or already-rejected request, **When** anyone attempts to change
   its decision, **Then** the system refuses — a correction requires a new, separate request.

### Edge Cases

- What happens when an Employee requests leave that spans a company holiday within the range?
  The holiday day(s) MUST NOT be counted against their leave balance.
- What happens if a Manager tries to approve their own leave request? The system MUST route
  their request to their own manager or HR/Admin instead, never self-approval.
- What happens when an employee's reporting manager changes while a leave request from them is
  still pending? The pending request MUST become visible to the new manager's queue, not remain
  stuck with the old one.
- How does the system handle a leave request submitted for past dates? It MUST be allowed only
  for HR/Admin to record after-the-fact leave, not for a self-service Employee request.
- What happens when check-out is missed for a day? The system MUST still show that day as
  incomplete rather than silently treating it as a full day worked.
- What happens when a leave request's date range includes a weekend? Weekend days MUST NOT be
  counted against the employee's leave balance, the same treatment as a company holiday.

## Clarifications

### Session 2026-09-14

- Q: When an employee requests leave for a date range that includes a weekend, should the weekend days count against their leave balance? → A: Only working days (Mon–Fri) count; weekends excluded, same treatment as holidays

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let any authenticated employee record one check-in and one check-out
  per calendar day.
- **FR-002**: System MUST compute and display hours worked for a day once both check-in and
  check-out are recorded.
- **FR-003**: System MUST prevent more than one check-in or check-out per employee per day.
- **FR-004**: System MUST maintain a configurable list of leave types (e.g., paid, unpaid, sick),
  each with a default annual allocation.
- **FR-005**: System MUST track each employee's leave balance per leave type per year (allocated
  vs. used).
- **FR-006**: System MUST let an employee file a leave request specifying leave type, start
  date, and end date.
- **FR-007**: System MUST block a leave request that exceeds the employee's remaining balance for
  that leave type, explaining the shortfall. The day count compared against the balance MUST
  include only working days (Monday–Friday) in the requested range (see FR-008).
- **FR-008**: System MUST exclude weekend days and company holidays from the day count charged
  against an employee's leave balance for an overlapping request — only working days (Monday–
  Friday, excluding holidays) are charged.
- **FR-009**: System MUST route each leave request to the employee's direct manager for decision,
  with HR/Admin able to decide on any request regardless of reporting line.
- **FR-010**: System MUST decrement the employee's leave balance only upon approval, never upon
  submission, and only by the count of working days (Monday–Friday, excluding holidays) in the
  approved range — matching the count used in FR-007/FR-008.
- **FR-011**: System MUST require a reason when a leave request is rejected, and MUST make that
  reason visible to the requester.
- **FR-012**: System MUST make an approved-or-rejected leave request's decision final — no
  further status transition is permitted on that same request.
- **FR-013**: System MUST maintain a company holiday calendar, editable by HR/Admin and viewable
  by all employees.
- **FR-014**: System MUST let a Manager view a queue of pending leave requests limited to their
  own direct reports.
- **FR-015**: System MUST let HR/Admin view a queue of all pending leave requests company-wide.

### Key Entities

- **Attendance record**: One row per employee per calendar day — check-in time, check-out time,
  computed status (present/absent/on leave/holiday).
- **Leave type**: A named category of leave (e.g., "Sick," "Paid") with whether it's paid and its
  default annual allocation.
- **Leave balance**: Per employee, per leave type, per year — days allocated and days used.
- **Leave request**: A request for a date range under one leave type, with a status
  (pending/approved/rejected) and, if decided, who decided it. Its balance-charged day count
  includes only working days (Monday–Friday) within the range, excluding weekends and holidays.
- **Holiday**: A named calendar date (optionally regional) that the company observes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An employee can complete a check-in or check-out in a single action, in under 5
  seconds including page load.
- **SC-002**: An employee can file a leave request in under 1 minute from opening the leave page.
- **SC-003**: 100% of leave balance decrements occur only after an explicit approval, with zero
  observed cases of a balance changing on submission or rejection during acceptance testing.
- **SC-004**: A Manager's pending-approval queue never shows a request from outside their
  reporting line, verified across all test scenarios.
- **SC-005**: Once decided, a leave request's status never changes again — verified by attempting
  a second decision on 100% of decided requests during testing and confirming refusal.

## Assumptions

- Half-day leave is out of scope for v0.1; every leave request is counted in whole days.
- Leave carry-over between years and configurable accrual rules (e.g., monthly accrual) are out
  of scope for v0.1; balances are allocated as a fixed amount per year.
- Geofencing or biometric verification of check-in/out location is out of scope for v0.1;
  check-in/out is a self-reported action trusted at face value.
- Shift schedules and multiple check-in/out pairs per day (breaks) are out of scope for v0.1 —
  one check-in and one check-out per day.
