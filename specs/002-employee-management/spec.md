# Feature Specification: Employee Management

**Feature Branch**: `002-employee-management`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Employee records, departments, designations, and reporting lines — the system of record every other TeamLoom module reads from."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR onboards a new employee (Priority: P1)

An HR user adds a new hire to the system: name, contact details, department, designation, and
reporting manager. The new hire immediately shows up in the directory and can sign in once their
account is provisioned.

**Why this priority**: Every other module — attendance, payroll, recruitment-to-hire — depends
on an employee record existing first. Nothing else can be demonstrated without it.

**Independent Test**: Create one employee end-to-end (record + linked login) and confirm they
appear in the directory and can sign in — delivers standalone value as a working employee
directory even before other modules exist.

**Acceptance Scenarios**:

1. **Given** an HR user filling out the new-employee form, **When** they submit required fields
   (name, email, department, designation, joining date), **Then** a new employee record is
   created and appears in the directory immediately.
2. **Given** a newly created employee, **When** HR assigns them a reporting manager, **Then**
   that relationship is reflected on both the employee's profile and the manager's team view.
3. **Given** an HR user, **When** they submit the form with a missing required field, **Then**
   they see a field-specific error and no record is created.

---

### User Story 2 - Anyone finds and views the employee directory appropriate to their role (Priority: P1)

An Employee can find their own profile and their teammates' names/titles; a Manager can see
their team; HR/Admin can see and search everyone.

**Why this priority**: The directory is the most frequently used, lowest-friction feature in any
HR system — it's the first thing people check.

**Independent Test**: Search and open a profile as each role and confirm the visible set of
employees matches the intended scope for that role.

**Acceptance Scenarios**:

1. **Given** an Employee, **When** they open the directory, **Then** they see their own profile
   and can search basic info (name, department, title) of colleagues, but not restricted fields
   like salary.
2. **Given** a Manager, **When** they open their team view, **Then** they see full profiles for
   their direct reports.
3. **Given** an HR or Admin user, **When** they search by department or status, **Then** results
   are filtered accordingly across the whole organization.

---

### User Story 3 - HR updates or offboards an employee (Priority: P2)

An employee changes department, gets a new manager, or leaves the company — HR keeps the record
accurate, and an offboarded employee stops appearing as active anywhere else in the system.

**Why this priority**: Org changes happen continuously; without this, the directory and every
downstream module (payroll eligibility, leave balances, reporting lines) drifts out of date.

**Independent Test**: Change an existing employee's department/manager and confirm the change
propagates to their profile and their new/old manager's team view; mark one offboarded and
confirm they stop appearing in active lists.

**Acceptance Scenarios**:

1. **Given** an existing employee, **When** HR updates their department, designation, or
   manager, **Then** the profile reflects the change immediately and the previous manager no
   longer sees them on their team view.
2. **Given** an existing employee, **When** HR marks them offboarded, **Then** they no longer
   appear in active employee lists, cannot sign in, but their historical records (past
   attendance, past payslips) remain intact for audit purposes.
3. **Given** an Admin, **When** they attempt to permanently delete an employee record, **Then**
   the system prevents a hard delete and offers offboarding instead, preserving history.

### Edge Cases

- What happens if HR tries to set an employee as their own reporting manager (a self-reference
  loop)? The system MUST reject it.
- What happens if HR tries to assign a manager who is themselves offboarded? The system MUST
  reject it or warn and require a replacement.
- How does the system handle two employees with the same name? Each employee MUST have a unique,
  system-generated employee code so records are never ambiguous.
- What happens to a Manager's team view when all their direct reports are reassigned elsewhere?
  It MUST show an empty team, not an error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow HR/Admin to create an employee record with, at minimum: name,
  contact email, department, designation, reporting manager (optional for top-level roles), and
  joining date.
- **FR-002**: System MUST assign each employee a unique, human-readable employee code
  automatically upon creation.
- **FR-003**: System MUST allow HR/Admin to edit any employee's department, designation,
  reporting manager, and status.
- **FR-004**: System MUST prevent an employee from being set as their own direct or transitive
  reporting manager.
- **FR-005**: System MUST let any authenticated user view a directory scoped to their role
  (Employee: self + basic colleague info; Manager: self + direct reports in full; HR/Admin: all
  employees in full).
- **FR-006**: System MUST let a user filter/search the directory by department, designation, or
  status within the bounds of what their role can see.
- **FR-007**: System MUST support "offboarding" an employee (deactivation) rather than permanent
  deletion, preserving all of that employee's historical records elsewhere in the system.
- **FR-008**: System MUST prevent an offboarded employee from signing in.
- **FR-009**: System MUST maintain a small set of shared lookup lists — departments and
  designations — that HR/Admin can create and that employee records reference.
- **FR-010**: System MUST let a Manager view a simple reporting-line view (their manager, their
  direct reports) for their own position in the org.
- **FR-011**: System MUST record who changed an employee's record and when, for audit purposes.

### Key Entities

- **Employee**: The central HR record — name, employee code, department, designation, reporting
  manager (self-referencing), joining date, and status (active/offboarded). Every other module
  (attendance, payroll, recruitment interviewer) links back to this record rather than
  duplicating identity data.
- **Department**: A named organizational grouping employees belong to.
- **Designation**: A named job title/level employees hold.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: HR can onboard a new employee (create the record end-to-end) in under 2 minutes.
- **SC-002**: 100% of employees appear correctly scoped in the directory view for each of the
  four roles during acceptance testing — no over- or under-exposure of records.
- **SC-003**: An org-chart change (department, manager reassignment) is visible to all affected
  users (old manager, new manager, the employee) within the same session, with no stale views.
- **SC-004**: Zero permanent data loss on offboarding — 100% of an offboarded employee's
  historical records remain retrievable by HR/Admin after offboarding.

## Assumptions

- Bulk import (CSV upload of many employees at once) is out of scope for v0.1; employees are
  created one at a time through the form.
- An employee's linked login account (see Authentication & RBAC) is provisioned automatically
  when the employee record is created; a separate "invite" email flow is out of scope for v0.1.
- Org chart visualization is limited to a simple manager/direct-reports view for one employee at
  a time; a full interactive company-wide org chart is out of scope for v0.1.
- Multi-company/tenant support is out of scope for v0.1.
