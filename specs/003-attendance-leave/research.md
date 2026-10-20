# Phase 0 Research: Attendance & Leave

## R1: Working-day count calculation (weekends + holidays excluded)

**Decision**: A single `countWorkingDays(orgId, startDate, endDate)` service function: iterate
the date range day-by-day, skip Saturday/Sunday (`date.getDay() === 0 || 6`), skip any date
present in that org's `Holiday` table for the range, count the rest. Called identically at
request-time (FR-007's balance check) and at approval-time (FR-010's decrement) so the two
counts can never disagree — the same function, not two independent implementations.

**Rationale**: Per spec Clarifications (2026-09-14), only Monday–Friday, non-holiday days count
against the balance. A plain loop over a date range (at most a few hundred iterations even for a
multi-month request) is simpler and has zero new dependencies compared to a calendar/date
library — Principle VII. Reusing one function for both the pre-submission check and the
approval-time decrement is what guarantees FR-007 and FR-010 stay consistent by construction,
not by convention.

**Alternatives considered**: A date-range library (e.g., `date-fns` business-day helpers) —
rejected as unnecessary; the org's holiday list is already a DB table this function must query
regardless, so a library only replaces the weekend-skip one-liner. Storing a precomputed
`workingDays` count on the `LeaveRequest` row at creation time and trusting it forever — accepted
as the actual design (see data-model.md), but *computed* fresh at both check-time and
approval-time rather than assumed stable, since a holiday could theoretically be added to the
calendar between request and decision (edge case: spec doesn't require re-validation on
approval, but computing fresh from the same function costs nothing extra and avoids a stale
`days` value silently drifting from the live holiday calendar).

## R2: Overlap detection (leave request vs. existing approved leave / holiday)

**Decision**: On request creation, query for (a) any `Holiday` row within `[startDate, endDate]`
and (b) any of the requester's own `LeaveRequest` rows with `status = APPROVED` whose range
overlaps `[startDate, endDate]`. If either matches, surface it as a non-blocking warning in the
create response (`overlaps: { holidays: [...], leaveRequests: [...] }`) — the request is still
created (spec FR-006 doesn't say overlap blocks submission, only that it must be "flagged before
submission," i.e., shown to the user), not rejected outright, since a holiday overlap is already
excluded from the day count by R1 and an overlapping *pending* request from someone else isn't
this employee's concern.

**Rationale**: Spec User Story 2 Acceptance Scenario 4 says the system "flags the overlap before
submission" — a warning surfaced in the UI before the employee confirms, not a hard block (FR-007
is the only hard block, and it's about balance, not overlap). Checking only the *requester's own*
approved requests (not company-wide) matches the plain reading of "an existing approved leave
request" in context of that employee's own leave history.

**Alternatives considered**: Blocking the request outright on any overlap — rejected; the spec's
wording ("flags... before submission") describes a warning surfaced during the form flow, not a
rejection, and nothing in FR-006/FR-007 lists overlap as a rejection condition.

## R3: Self-approval routing

**Decision**: When building a Manager's leave-approval queue (`GET /leave-requests/queue`), the
Manager's *own* pending leave requests are excluded from their own queue regardless of who their
`managerId` resolves to — they always appear in *their own manager's* queue (or HR/Admin's
company-wide queue if the Manager has no manager, i.e., a top-level Manager). Enforced in the
service layer by simply never including `requesterId === callerId` in query results, and by
routing approval-target resolution (FR-009 "route to the employee's direct manager") to use the
employee's `manager.managerId` (their manager's manager) specifically for the case where the
employee *is* a Manager whose own manager is unset — in that case the request routes to any
HR/Admin queue instead (§ R5 handles the "route to HR/Admin" fallback generally).

**Rationale**: Spec Edge Cases: "What happens if a Manager tries to approve their own leave
request? The system MUST route their request to their own manager or HR/Admin instead, never
self-approval." This is a routing decision, not a UI-level disable — if the approval endpoint
itself refuses `approverId === requesterId`, self-approval is structurally impossible, not just
hidden from a menu.

**Alternatives considered**: A UI-only prevention (hide the approve button on one's own request)
— rejected; a defense-in-depth service-layer check is required per constitution Principle III
("enforce in the service layer, not only at the route"), and self-approval must be impossible via
direct API call too, not just hidden in the UI.

## R4: Approval endpoint's own-request guard

**Decision**: `POST /leave-requests/:id/approve` and `.../reject` both check
`request.employeeId !== caller.employeeId` before proceeding; if they're equal, throw
`DomainError("SELF_APPROVAL_FORBIDDEN", ..., 403)` regardless of the caller's role (even HR/Admin
approving their own request is refused — the spec's "never self-approval" reads as an absolute
rule, not one that has an HR/Admin exception).

**Rationale**: Backs R3's routing decision with an unconditional check at the point of decision,
closing the gap a routing-only approach would leave (a Manager could still directly call the
approve endpoint on their own pending request if nothing checks at decision-time, only at
queue-build-time).

**Alternatives considered**: Only preventing self-approval for the `MANAGER` role, allowing
HR/Admin to approve their own request — rejected; the spec Edge Case's wording doesn't carve out
an HR/Admin exception, and an unconditional rule is simpler to reason about and test.

## R5: Manager reassignment mid-flight (pending request follows the new manager)

**Decision**: No stored `approverId` (or equivalent) is set on a `LeaveRequest` while it's
`PENDING` — `LeaveRequest.approverId` (schema.prisma) is only populated at decision time, when
the request transitions to `APPROVED`/`REJECTED`. The Manager approval queue is computed live at
query time by joining the requester's *current* `Employee.managerId` (via 002's `getTeamView` or
an equivalent direct-reports query), not by a value captured when the request was created.

**Rationale**: Spec Edge Cases: "a pending request MUST become visible to the new manager's
queue, not remain stuck with the old one." Since the schema already has no "assigned approver"
field for pending requests (only `approverId`, set on decision), this requirement is satisfied
automatically by always computing the queue from live reporting-line data — no extra field or
migration needed, and no risk of a stale assignment to clean up on manager reassignment.

**Alternatives considered**: Storing a `assignedApproverId` at request-creation time and updating
it on manager-reassignment events — rejected as unnecessary state to keep in sync (Principle
VII); computing live from `Employee.managerId` is simpler and can't go stale.

## R6: Attendance status computation

**Decision**: `Attendance.status` is set to `PRESENT` once both `checkIn` and `checkOut` are
recorded for the day; remains implicitly "checked in" (no dedicated status enum value — the UI
infers this from `checkIn IS NOT NULL AND checkOut IS NULL`) while only `checkIn` is set;
`ON_LEAVE` is set by the leave-approval flow (R7) for each working day in an approved range;
`HOLIDAY` is set for company holidays; days with no `Attendance` row at all (past days, no
check-in) are treated as `ABSENT` by the history view without a materialized row per employee
per day (avoids pre-creating rows for every employee for every calendar day — Principle VII).

**Rationale**: The `AttendanceStatus` enum (schema.prisma: `PRESENT | ABSENT | ON_LEAVE |
HOLIDAY`) has no "checked in but not out" value; spec Edge Cases says a missed checkout "MUST
still show that day as incomplete rather than silently treating it as a full day worked" — this
is satisfied by the UI reading `checkOut IS NULL` directly rather than needing a fifth enum
value, keeping the stored status meaningful only once the day is actually complete or otherwise
resolved (leave/holiday/explicitly absent).

**Alternatives considered**: Adding a `CHECKED_IN` status value to the enum — rejected; would
require a schema migration to an enum that's shared with 004's payroll-eligibility reads, and the
existing `checkIn`/`checkOut` nullability already expresses the same information without it
(Principle VII).

## R7: Marking ON_LEAVE attendance rows on approval

**Decision**: When a leave request is approved, the service creates or updates an `Attendance`
row (`status = ON_LEAVE`) for each working day in the approved range (using R1's same
`countWorkingDays` logic to know which days those are) — in the same transaction as the
`LeaveRequest` status change and `LeaveBalance` decrement, per constitution Principle IV.

**Rationale**: Spec User Story 1 Acceptance Scenario 4 requires the attendance history to show
"on leave" as a status alongside present/absent/holiday — this only happens if approval writes
those rows; nothing else in the system would populate them otherwise (an employee doesn't
"check in" on a leave day).

**Alternatives considered**: Computing `ON_LEAVE` status on-the-fly in the history view by
cross-referencing approved `LeaveRequest` ranges instead of writing `Attendance` rows — rejected;
would require the attendance history query to join against `LeaveRequest` for every read instead
of a single indexed `Attendance` table scan, and would complicate R6's "no row = absent" default
(an on-leave day with no row would incorrectly read as absent). Writing the row once at approval
time is simpler and matches how `HOLIDAY` rows would need the same treatment already.
