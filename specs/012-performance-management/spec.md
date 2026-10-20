# Feature Specification: Performance Management (Goals & Reviews)

**Feature Branch**: `012-performance-management`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Lightweight goals/OKRs plus a review cycle tied to the Employee record — the performance-management layer most modern HRMS suites bundle by default."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Employee and Manager set goals for a period (Priority: P1)

An Employee creates goals for a defined period (e.g., a quarter), their Manager reviews and
agrees on them, and both can track progress as the period goes on.

**Why this priority**: Goals are the input every later review cycle is judged against — nothing
else in this feature is meaningful without them.

**Independent Test**: Create one goal as an Employee, have the Manager view and approve it, and
update its progress partway through the period — confirm both parties see the current state.

**Acceptance Scenarios**:

1. **Given** an Employee, **When** they create a goal with a description and target date,
   **Then** it appears on their goals list as pending manager approval.
2. **Given** a pending goal, **When** the Manager approves it, **Then** its status becomes
   active and it counts toward that period's goal set.
3. **Given** an active goal, **When** the Employee updates its progress (e.g., a percentage or a
   status note), **Then** the Manager sees the updated progress without needing to ask.
4. **Given** a Manager reviewing a proposed goal, **When** they request a change instead of
   approving, **Then** the Employee sees the requested change and can revise before resubmitting.

---

### User Story 2 - Manager conducts a review at the end of a cycle (Priority: P1)

At the end of a review period, the Manager rates the Employee's goal completion and overall
performance, the Employee can add self-reflection comments, and the finished review becomes part
of that employee's permanent record.

**Why this priority**: This is the operational core of "performance management" — goals without
an eventual review are just a to-do list with no closure.

**Independent Test**: Complete a review cycle for one employee — Manager rating plus employee
comments — and confirm it's saved as a finished, retrievable review record.

**Acceptance Scenarios**:

1. **Given** an employee's goals for a completed period, **When** the Manager opens the review
   for that period, **Then** they see each goal and its final progress to rate against.
2. **Given** a review in progress, **When** the Employee adds self-reflection comments,
   **Then** they're saved alongside the Manager's rating on the same review record.
3. **Given** a Manager submits a completed review, **When** it's submitted, **Then** its status
   becomes final and it appears on the employee's performance history.
4. **Given** a finalized review, **When** anyone attempts to edit it, **Then** the system refuses
   — a correction requires HR/Admin intervention, not a silent edit.

---

### User Story 3 - HR oversees review cycles across the company (Priority: P2)

HR/Admin defines when a review cycle opens and closes for the whole company (or a department) and
can see completion status across all employees, chasing down anyone still incomplete.

**Why this priority**: Coordination/oversight layer that depends on P1 (goals) and P1 (individual
reviews) already functioning; valuable at scale but not blocking for a single team's use of the
feature.

**Independent Test**: Open a review cycle for a group of employees, complete reviews for some but
not all, and confirm HR's oversight view correctly shows which are done and which are pending.

**Acceptance Scenarios**:

1. **Given** HR/Admin, **When** they open a new review cycle with a start and end date,
   **Then** it becomes active for the employees it applies to.
2. **Given** an active review cycle, **When** HR/Admin views its status, **Then** they see a
   count of completed vs. pending reviews across the covered employees.
3. **Given** a review cycle's end date has passed with reviews still pending, **When** HR/Admin
   views the cycle, **Then** those employees/managers are clearly flagged as overdue.

### Edge Cases

- What happens if a Manager changes (reassignment) partway through an active review cycle? The
  review MUST transfer to the new manager, and the change MUST be visible on the review record for
  context.
- What happens if an employee has zero goals for a period when their review comes due? The
  Manager MUST still be able to complete a review based on overall performance notes, without
  goals being a hard requirement.
- What happens if an employee is offboarded mid-cycle? Their in-progress review MUST remain
  visible to HR/Admin for record-keeping but is no longer required to be completed for
  active-workforce reporting purposes.
- What happens when a Manager attempts to rate a direct report from a different department after
  a reporting-line change was not yet reflected? Access follows the Employee Management (002)
  reporting line as of the time of the action, consistent with Authentication & RBAC (001).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let an Employee create a goal for a defined period with a description
  and target date.
- **FR-002**: System MUST require Manager approval before a proposed goal counts as active for
  the period.
- **FR-003**: System MUST let a Manager request changes to a proposed goal instead of only
  approve/reject.
- **FR-004**: System MUST let an Employee update progress on their own active goals at any point
  before the period ends.
- **FR-005**: System MUST let a Manager complete a review for a direct report covering that
  period's goals, with a rating and comments.
- **FR-006**: System MUST let an Employee add self-reflection comments to their own review before
  or as part of its completion.
- **FR-007**: System MUST make a finalized (submitted) review immutable to both Employee and
  Manager; only HR/Admin may correct a finalized review, and any such correction MUST be
  recorded.
- **FR-008**: System MUST let HR/Admin define a review cycle with a start date, end date, and the
  set of employees it applies to.
- **FR-009**: System MUST let HR/Admin view, for an active or closed review cycle, a count of
  completed vs. pending reviews.
- **FR-010**: System MUST flag a review as overdue once its cycle's end date has passed without
  completion.
- **FR-011**: System MUST transfer an in-progress review to an employee's new manager if their
  reporting line changes before the review is finalized.
- **FR-012**: System MUST retain an employee's full goal and review history as part of their
  record, visible to HR/Admin and to the employee for their own history.

### Key Entities

- **Goal**: One objective for one employee for one period — description, target date, status
  (pending approval/active/completed), and progress.
- **Review**: One performance review for one employee for one period — the goals it covers,
  Manager rating and comments, Employee self-reflection, and a status (in progress/final).
- **Review cycle**: A company- or department-wide window (start/end date) that a set of employees'
  reviews are due within.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An Employee can create a goal in under 2 minutes.
- **SC-002**: A Manager can complete a review for one direct report in under 10 minutes.
- **SC-003**: HR can determine full review-cycle completion status across the covered workforce
  in a single view, in under 15 seconds.
- **SC-004**: Zero cases, during acceptance testing, of a finalized review being edited by anyone
  other than HR/Admin.
- **SC-005**: 100% of in-progress reviews correctly transfer to a new manager when a reporting-line
  change occurs before finalization.

## Assumptions

- Peer or 360-degree feedback (input from colleagues other than the direct manager) is out of
  scope for v1.1; reviews are Manager-and-self only.
- Compensation/promotion decisions are not directly tied to review outcomes in this feature —
  a review's rating is informational and does not automatically trigger a salary-structure change
  in Payroll (004).
- A single, fixed rating scale (not configurable per department) is used for v1.1; scale
  customization is deferred.
- This feature depends on Employee Management (002) for reporting-line data and on Authentication
  & RBAC (001) for role scoping, and pairs naturally with HR Analytics & Reporting (011) for
  future trend views, though it does not require 011 to function.
