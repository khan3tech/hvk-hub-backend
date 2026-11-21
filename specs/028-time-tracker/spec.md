# Feature Specification: Time Tracker (Projects, Timesheets, Live Timer)

**Feature Branch**: `028-time-tracker`

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description: "Keka/Zoho-style time tracking: projects and tasks, employees log time against tasks or with a live start/stop timer, weekly timesheets submitted to the reporting manager for approval, and hours reports by project, employee and task, billable vs non-billable."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Employee logs time against a project task (Priority: P1)

An Employee records how long they worked on a task: they pick a project they're a member of, a
task in it, a date, a duration and an optional note, and mark it billable or not.

**Why this priority**: Logged time is the raw material for timesheets, approvals and reports;
nothing else in the feature works without it.

**Independent Test**: As an Employee who is a member of one project with one task, log 2h 30m for
today with a note, and confirm it appears in their entries for this week with the correct total.

**Acceptance Scenarios**:

1. **Given** an Employee who is a member of an active project, **When** they log a time entry on
   one of its tasks with a date, duration and note, **Then** it appears in their entries for that
   week and the week's total includes it.
2. **Given** an Employee who is not a member of a project, **When** they try to log time on its
   tasks, **Then** they're refused.
3. **Given** an entry in a week that's still a draft, **When** the Employee edits or deletes it,
   **Then** the change is saved and the totals update.
4. **Given** an entry, **When** its project is billable, **Then** the entry defaults to billable,
   but the Employee can mark it non-billable.

---

### User Story 2 - HR/Managers set up projects and tasks (Priority: P1)

HR/Admin or a Manager creates a project (name, code, client name, billable or not), adds tasks to
it, and assigns employees as members. HR/Admin can manage any project; a Manager manages the
projects they created.

**Why this priority**: Employees can only log time against projects and tasks that exist and
that they're assigned to, so setup is a prerequisite for Story 1.

**Independent Test**: Create a project with a unique code, add two tasks, assign one employee,
and confirm that employee sees the project and its tasks when logging time.

**Acceptance Scenarios**:

1. **Given** HR/Admin or a Manager, **When** they create a project with a name, a code that's
   unique in the organization, an optional client name and a billable flag, **Then** it appears in
   the project list as active.
2. **Given** a project, **When** its owner adds tasks and assigns members, **Then** only the
   members see it as available for logging time.
3. **Given** a project that's finished, **When** its owner archives it, **Then** no new time can
   be logged against it, but existing entries and reports still show it.
4. **Given** an Employee, **When** they try to create or change a project, **Then** they're refused.

---

### User Story 3 - Employee uses a live timer (Priority: P1)

Instead of typing a duration, an Employee starts a timer on a task when they begin work and stops
it when they finish; stopping it creates the time entry automatically.

**Why this priority**: It's the fastest way to capture time accurately, and the user asked for
it explicitly.

**Independent Test**: Start a timer on a task, reload the app, confirm the timer is still running
with the right elapsed time, stop it, and confirm a time entry for the elapsed duration exists.

**Acceptance Scenarios**:

1. **Given** an Employee with no running timer, **When** they start one on a task they're a
   member of, **Then** it runs and is visible to them wherever they are in the app, including
   after a reload or on another device.
2. **Given** an Employee with a running timer, **When** they try to start a second one, **Then**
   they're told one is already running, and can stop it first or switch to the new task, which
   stops the old timer and saves its entry.
3. **Given** a running timer, **When** the Employee stops it, **Then** a time entry is created
   for the start date with the elapsed duration (rounded to the minute) and any note they added.
4. **Given** a timer that has run past midnight or for more than 12 hours, **When** it's stopped,
   **Then** the resulting entry is flagged for review, so a forgotten timer is easy to spot and
   correct.
5. **Given** a running timer, **When** the Employee discards it, **Then** no entry is created.

---

### User Story 4 - Weekly timesheet submission and approval (Priority: P1)

Each Employee's entries for a Monday–Sunday week form their timesheet for that week. They submit
it; their reporting manager approves it or rejects it with a reason. HR/Admin can approve or
reject anyone's.

**Why this priority**: Approval is what turns logged time into trusted data for billing and
reporting.

**Independent Test**: Log entries in a week, submit it, approve it as the employee's manager, and
confirm the week is locked and shows as approved; repeat with a rejection and confirm the
employee can edit and resubmit.

**Acceptance Scenarios**:

1. **Given** a week with at least one entry, **When** the Employee submits it, **Then** its status
   becomes Submitted, its entries can no longer be edited, and their manager is notified.
2. **Given** a submitted timesheet, **When** the employee's reporting manager (or HR/Admin)
   approves it, **Then** its status becomes Approved, it stays locked, and the employee is notified.
3. **Given** a submitted timesheet, **When** the approver rejects it, **Then** they must give a
   reason, the status becomes Rejected, the week is unlocked for edits, and the employee is
   notified with the reason.
4. **Given** a rejected timesheet, **When** the Employee fixes their entries and resubmits it,
   **Then** it goes back to Submitted.
5. **Given** a Manager, **When** they try to approve a timesheet of someone who isn't their direct
   report, **Then** they're refused.
6. **Given** an Approved timesheet, **When** HR/Admin needs to correct it, **Then** they can reopen
   it to Draft with a reason, and the change is audited.
7. **Given** a week, **When** the Employee tries to add an entry or start a timer dated in a
   submitted or approved week, **Then** they're refused.

---

### User Story 5 - Hours reports (Priority: P2)

Managers and HR/Admin see hours over a date range, grouped by project, employee or task, split
into billable and non-billable, and limited to what they're allowed to see. Employees see their
own.

**Why this priority**: Reports are what make the data useful for billing, capacity planning and
payroll checks, but they build on Stories 1–4.

**Independent Test**: With known entries across two projects and two employees, run the report
for the range grouped by project, and confirm totals and billable splits match the entries.

**Acceptance Scenarios**:

1. **Given** entries in a date range, **When** HR/Admin runs the report grouped by project,
   employee or task, **Then** each row shows total, billable and non-billable hours that match the
   underlying entries.
2. **Given** a Manager, **When** they run the report, **Then** it includes only their direct
   reports' time (and their own).
3. **Given** an Employee, **When** they view the report, **Then** it includes only their own time.
4. **Given** a report filter for status, **When** "approved only" is chosen, **Then** only time
   from approved timesheets is counted.

---

### User Story 6 - Managers review their team's week (Priority: P2)

A Manager sees, for a chosen week, each direct report's timesheet status and total hours, so
they can chase missing submissions and work through pending approvals.

**Why this priority**: Makes approvals manageable for a team, but approvals already work
one-by-one from Story 4.

**Independent Test**: With three direct reports in different states (none logged, submitted,
approved), open the team week view and confirm each shows the right status and total.

**Acceptance Scenarios**:

1. **Given** a Manager, **When** they open the team view for a week, **Then** every direct report
   is listed with their status (Not started / Draft / Submitted / Approved / Rejected) and total hours.
2. **Given** submitted timesheets in that view, **When** the Manager opens one, **Then** they can
   see its entries by day and approve or reject it.

### Edge Cases

- An entry with zero or negative duration, or more than 24 hours on a single day for one employee,
  is refused.
- A timer started on a task whose project is archived, or from which the employee is removed,
  while it's running: stopping it still saves the entry, but no new timer can start there.
- A timer left running while its week gets submitted can't happen: submission is refused while
  the employee has a running timer dated in that week.
- An employee with no reporting manager: their timesheet can be approved by HR/Admin only.
- An offboarded employee's timesheets and entries stay visible in reports; they can't log time.
- Editing an entry to move it into a different week moves it between timesheets, and is refused
  if either week is locked.
- Time zones: an entry's date is the employee's local calendar date at the time it was logged or
  the timer started, using the organization's time zone.
- Deleting a task or project that already has entries is refused; it must be archived instead.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: HR/Admin and Managers MUST be able to create projects with a name, an organization-unique code, an optional client name and a billable flag; HR/Admin can edit any project, a Manager only projects they created.
- **FR-002**: Project owners MUST be able to add, rename and archive tasks, and add or remove project members (active employees only).
- **FR-003**: Projects and tasks MUST be archivable; archived ones accept no new time but remain in history and reports. Anything with entries MUST NOT be deleted.
- **FR-004**: An Employee MUST be able to create, edit and delete their own time entries (project task, date, duration in minutes, optional note up to 1,000 characters, billable flag) only on tasks of active projects they're a member of.
- **FR-005**: Entries MUST default to billable when the project is billable and non-billable otherwise; the employee can override this per entry.
- **FR-006**: The system MUST refuse entries with a duration of 0 or less, and any change that would put an employee over 24 hours on a single date.
- **FR-007**: An Employee MUST be able to start a timer on a task they can log time to; each employee can have at most one running timer.
- **FR-008**: A running timer MUST persist on the server, so it survives reloads and is visible across devices, and MUST be retrievable as "my current timer" with its start time and task.
- **FR-009**: Stopping a timer MUST create a time entry dated on the timer's start date (organization time zone) with the elapsed minutes and any note; discarding it MUST create nothing.
- **FR-010**: Starting a timer while one is running MUST be refused, unless the employee explicitly asks to switch, which stops and saves the running timer, then starts the new one.
- **FR-011**: Entries created from a timer that crossed midnight or ran over 12 hours MUST be flagged for review and shown as flagged to the employee and approver.
- **FR-012**: Each employee's entries MUST roll up into one timesheet per Monday–Sunday week, with status DRAFT, SUBMITTED, APPROVED or REJECTED; a week with no timesheet record yet counts as "not started".
- **FR-013**: An Employee MUST be able to submit a week that has at least one entry and no running timer dated in it; SUBMITTED and APPROVED weeks MUST be locked against adding, editing or deleting entries and starting timers.
- **FR-014**: The employee's reporting manager MUST be able to approve or reject their submitted timesheets; HR/Admin MUST be able to approve or reject anyone's. A rejection MUST include a reason (10–1,000 characters) and unlocks the week.
- **FR-015**: HR/Admin MUST be able to reopen an approved timesheet to DRAFT with a reason.
- **FR-016**: Submission MUST notify the approver (the reporting manager, or HR if there is none); approval, rejection and reopening MUST notify the employee, using the existing notifications module.
- **FR-017**: Every timesheet status change MUST be recorded in the audit log with actor, from/to status and reason.
- **FR-018**: The system MUST provide an hours report over a date range (max 366 days), grouped by project, employee or task, with total, billable and non-billable minutes, optionally filtered by project, employee and "approved only".
- **FR-019**: Report and list scoping MUST follow RBAC: Employee sees own time; Manager sees own and direct reports' time; HR/Admin see all, within the organization.
- **FR-020**: Managers MUST be able to list, for a given week, each direct report's timesheet status and total minutes; HR/Admin MUST be able to do the same across the organization, filterable by status.
- **FR-021**: All data MUST be scoped to the caller's organization (multi-tenant), like every other module.
- **FR-022**: Only active (not offboarded) employees can log time or run timers; past data for offboarded employees remains reportable.

### Key Entities

- **Project**: a body of work time is logged against: name, unique code, optional client name, billable flag, status (active/archived), owner (creator), members.
- **Project Member**: an employee assigned to a project, allowed to log time on its tasks.
- **Task**: a unit of work within a project: name, status (active/archived).
- **Time Entry**: time an employee spent on a task: employee, task (and so project), date, duration in minutes, note, billable flag, source (manual or timer), review flag.
- **Running Timer**: an employee's in-progress timer: employee (at most one), task, start time, optional note.
- **Timesheet**: one employee's week (Monday start date): status, submitted/decided timestamps, approver, rejection or reopen reason; groups that week's entries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An employee can log a manual entry in under 30 seconds and start or stop a timer in one action.
- **SC-002**: A running timer shows the same elapsed time, within a few seconds, after a reload or on a second device.
- **SC-003**: A manager can review and approve a direct report's weekly timesheet in under 1 minute.
- **SC-004**: Report totals match the sum of the underlying entries exactly, for every grouping.
- **SC-005**: No employee can see another employee's entries, or edit a locked week, unless their role allows it; there are zero exceptions in access tests across all four roles.
- **SC-006**: Forgotten timers (overnight or over 12 hours) are flagged 100% of the time.

## Assumptions

- The organization's time zone (Asia/Kolkata for every organization in this version; there's no per-org setting yet) decides which calendar date an entry or timer falls on and where a week starts.
- Weeks run Monday–Sunday for every organization in this version.
- Approval is single-level: reporting manager or HR/Admin. Multi-level approval, overtime rules, and billing rates or invoicing are out of scope.
- Time tracking is independent of attendance check-in/out (003); the two are not reconciled in this version.
- The "reporting manager" is the employee's manager field from the employee module (002); a Manager's "team" means their direct reports, as in other modules.
- Durations are stored and reported in whole minutes.
- Notifications reuse module 006; no email or push channel beyond what it already supports.
