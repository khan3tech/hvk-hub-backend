# Feature Specification: Employee Onboarding Workflow

**Feature Branch**: `007-employee-onboarding`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "A structured, checklist-driven new-hire flow — documents to submit, assets to assign, induction tasks — instead of a new employee just appearing as a bare record."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR starts onboarding for a new hire (Priority: P1)

When HR creates a new employee record, they kick off an onboarding checklist for that person —
a defined set of tasks (submit ID proof, assign a laptop, complete induction) that must happen
before the hire is considered fully onboarded.

**Why this priority**: Without a checklist, "onboarding" is just record creation — this is what
turns it into an actual guided process, the core value of the feature.

**Independent Test**: Create a new employee and confirm an onboarding checklist is
auto-attached with its default tasks, all initially incomplete.

**Acceptance Scenarios**:

1. **Given** HR creates a new employee, **When** the record is saved, **Then** an onboarding
   checklist is created for that employee with a standard set of tasks, all marked incomplete.
2. **Given** an onboarding checklist, **When** HR adds a one-off task specific to this hire
   (e.g., "arrange visa paperwork"), **Then** it appears alongside the standard tasks on that
   employee's checklist only.
3. **Given** a new employee's onboarding checklist, **When** HR views the employee directory,
   **Then** they can see at a glance whether that employee's onboarding is still in progress or
   complete.

---

### User Story 2 - Tasks are completed by whoever owns them (Priority: P1)

Each onboarding task has an owner — HR, the new hire's Manager, IT (for asset assignment), or
the new hire themselves — and that owner marks their tasks complete as they finish them.

**Why this priority**: A checklist only one person can update doesn't reflect how onboarding
actually works across a company — different tasks belong to different people.

**Independent Test**: As each of the relevant roles, mark one owned task complete and confirm it
updates on the shared checklist visible to HR.

**Acceptance Scenarios**:

1. **Given** a task owned by the new hire's Manager (e.g., "assign a desk / team intro"),
   **When** the Manager marks it complete, **Then** it's reflected as done on the checklist for
   everyone who can view it.
2. **Given** a task owned by the new hire themselves (e.g., "submit ID proof"), **When** they
   mark it complete, **Then** HR sees it updated without needing to follow up.
3. **Given** a task with no explicit owner assigned, **When** the checklist is created, **Then**
   it defaults to HR as the owner.

---

### User Story 3 - HR sees onboarding progress across all new hires (Priority: P2)

HR opens a single view listing every employee currently mid-onboarding and how far along each
one is, so nobody's onboarding silently stalls.

**Why this priority**: Valuable at any hiring volume beyond one-at-a-time, but the checklist
itself (P1) already delivers value without this aggregate view.

**Independent Test**: With multiple employees at different onboarding completion states, open
the onboarding overview and confirm each shows accurate progress (e.g., "3 of 5 tasks done").

**Acceptance Scenarios**:

1. **Given** several employees mid-onboarding, **When** HR opens the onboarding overview,
   **Then** each appears with a completion count and how many days since their joining date.
2. **Given** an employee whose onboarding has been stalled (incomplete tasks past their joining
   date), **When** HR views the overview, **Then** that employee is visually flagged.
3. **Given** an employee whose onboarding is fully complete, **When** HR views the overview,
   **Then** they no longer appear in the active/in-progress list.

### Edge Cases

- What happens if HR needs a different checklist template for a different type of hire (e.g.,
  a contractor vs. a full-time employee)? v1.1 supports only one standard checklist template;
  per-employee-type templates are deferred (see Assumptions).
- What happens when a task's owner is offboarded before completing their assigned task? HR MUST
  be able to reassign that task to someone else.
- What happens if a new hire's joining date is postponed after onboarding has already started?
  The checklist MUST remain attached to the employee record and simply continue from wherever
  it was left off; no data is lost.
- How does the system handle an employee record created without an onboarding checklist (e.g.,
  legacy/backfilled employees)? HR MUST be able to attach a checklist to an existing employee
  manually, not only automatically at creation time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically create an onboarding checklist for every newly created
  employee record, populated with a standard, configurable set of default tasks.
- **FR-002**: System MUST let HR/Admin add, edit, or remove tasks on an individual employee's
  checklist without affecting the standard template used for other hires.
- **FR-003**: System MUST assign each task an owner role (HR, Manager, IT/Admin, or the employee
  themselves), defaulting to HR when unspecified.
- **FR-004**: System MUST let a task's owner (or HR/Admin) mark it complete, recording who
  completed it and when.
- **FR-005**: System MUST let HR/Admin manually attach an onboarding checklist to an existing
  employee record that doesn't already have one.
- **FR-006**: System MUST let HR/Admin reassign a task's owner, including after the original
  owner has been offboarded.
- **FR-007**: System MUST show, on the employee directory and profile, whether that employee's
  onboarding is in progress or complete.
- **FR-008**: System MUST provide HR/Admin an overview listing all employees with an in-progress
  checklist and their completion count.
- **FR-009**: System MUST flag, on the overview, any employee whose checklist is still
  incomplete past their joining date.
- **FR-010**: System MUST maintain a configurable list of standard onboarding tasks that HR/Admin
  can edit, which new checklists are populated from going forward (existing checklists are not
  retroactively changed).

### Key Entities

- **Onboarding checklist**: One per employee — a set of tasks with overall progress, linked to
  that Employee record.
- **Onboarding task**: A single checklist item — description, owner role, completion state, who
  completed it and when. Some come from the standard template; others are added per-employee.
- **Onboarding task template**: The configurable, ordered list of default tasks new checklists
  are seeded from.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every new employee record created during acceptance testing has an onboarding
  checklist attached with zero manual steps beyond creating the record.
- **SC-002**: HR can see, for any employee, exactly which onboarding tasks remain and who owns
  each, in under 15 seconds from the employee's profile.
- **SC-003**: 100% of task completions during testing correctly attribute who completed the task
  and when.
- **SC-004**: An employee whose onboarding checklist is fully complete disappears from the active
  onboarding overview within the same session — zero stale entries observed during testing.

## Assumptions

- One standard checklist template applies to all new hires in v1.1; per-role or per-employee-type
  templates (e.g., contractor vs. full-time) are deferred to a later pass.
- Automated task completion (e.g., auto-completing "submit ID proof" when a document is uploaded
  via Document Management, feature 008) is a nice-to-have integration, not required for v1.1 — a
  person can always mark it complete manually.
- This feature depends on Employee Management (002) for the employee record it attaches to, and
  is a natural pairing with Notifications (006) for nudging task owners, though notification
  integration is not itself a functional requirement here.
- A formal onboarding "buddy" program or induction scheduling calendar is out of scope for v1.1.
