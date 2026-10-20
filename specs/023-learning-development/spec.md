# Feature Specification: Learning & Development

**Feature Branch**: `023-learning-development`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Course assignments, certification tracking, and compliance-training completion — currently there's no structured way to assign or verify training."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR assigns a course to employees (Priority: P1)

HR/Admin creates a course record (a name, a description, and a link or reference to the actual
learning content hosted elsewhere) and assigns it to specific employees, a department, or the
whole company.

**Why this priority**: Nothing else in the feature exists without a course to assign — this is
the foundation.

**Independent Test**: Create one course and assign it to a test group, and confirm it appears as
assigned, incomplete, for each employee in that group.

**Acceptance Scenarios**:

1. **Given** HR/Admin, **When** they create a course and assign it to a department, **Then**
   every employee in that department sees it on their own learning list as incomplete.
2. **Given** an assigned course, **When** HR/Admin sets a due date, **Then** that due date is
   visible to each assignee.
3. **Given** an employee joining a department after a course was already assigned to it,
   **When** their record is created, **Then** HR/Admin can choose whether to include them
   (courses are not silently retroactive by default — see Assumptions).

---

### User Story 2 - Employee completes a course and it's recorded (Priority: P1)

An employee marks an assigned course complete (optionally after passing a simple
completion check), and their record reflects it without HR having to manually track spreadsheets.

**Why this priority**: This is the operational core — an assignment that never gets marked
complete provides no more value than a to-do list nobody checks off.

**Independent Test**: Mark an assigned course complete as an employee and confirm HR's tracking
view reflects that completion immediately.

**Acceptance Scenarios**:

1. **Given** an assigned, incomplete course, **When** an employee marks it complete, **Then**
   their record updates with a completion date, visible to HR/Admin.
2. **Given** a course configured to require a certificate/attestation upload as proof, **When**
   an employee marks it complete, **Then** they must attach that proof before completion is
   accepted.
3. **Given** an assigned course past its due date and still incomplete, **When** HR/Admin views
   the tracking overview, **Then** that assignment is visibly flagged overdue.

---

### User Story 3 - HR tracks compliance-training completion across the company (Priority: P1)

HR/Admin designates specific courses as "compliance-required" and sees, at a glance, exactly who
has and hasn't completed each one across the whole active workforce.

**Why this priority**: Compliance training (e.g., mandatory workplace-conduct or safety training)
is the highest-stakes use of this feature — an incomplete picture here is a genuine liability
risk, so it's equally P1 alongside basic assignment and completion.

**Independent Test**: Mark one course compliance-required, assign it company-wide, complete it
for some employees but not others, and confirm HR's compliance view accurately separates
completed from outstanding.

**Acceptance Scenarios**:

1. **Given** a course marked compliance-required, **When** HR/Admin views the compliance
   dashboard, **Then** they see completed-vs-outstanding counts for that course across the
   active workforce.
2. **Given** a new employee joining after a compliance-required course was assigned company-wide,
   **When** their record is created, **Then** they are automatically included as outstanding for
   that course (compliance assignments, unlike ordinary ones, do apply retroactively to new
   hires — see Assumptions).
3. **Given** an employee overdue on a compliance-required course, **When** HR/Admin views the
   compliance dashboard, **Then** that employee is clearly flagged, distinct from employees
   overdue on non-compliance courses.

### Edge Cases

- What happens if a course is deleted or retired after being assigned to people? Existing
  completion records MUST be retained for historical/audit purposes even if the course itself is
  archived and no longer assignable going forward.
- What happens when an employee is offboarded with incomplete assigned courses? Those assignments
  MUST no longer count toward active compliance tracking, but the historical assignment record is
  retained.
- What happens if a certificate/attestation upload is required but the employee has no file to
  attach? Completion MUST be blocked until a file is provided — this is enforced identically to
  the document requirements in Document Management (008), if present, or as a simple upload
  otherwise.
- What happens if HR needs to re-assign an already-completed course (e.g., an annual refresher)?
  HR/Admin MUST be able to create a new assignment cycle for the same course rather than being
  blocked by the prior completion.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let HR/Admin create a course with a name, description, and a
  reference/link to externally hosted learning content.
- **FR-002**: System MUST let HR/Admin assign a course to specific employees, a department, or
  the whole company, optionally with a due date.
- **FR-003**: System MUST let an employee view their own assigned courses and mark an assigned
  course complete.
- **FR-004**: System MUST let HR/Admin configure a course to require a certificate/attestation
  upload before completion is accepted.
- **FR-005**: System MUST flag an assignment as overdue once its due date passes without
  completion.
- **FR-006**: System MUST let HR/Admin designate a course as compliance-required.
- **FR-007**: System MUST automatically include new employees, going forward, in any
  compliance-required course already assigned company-wide or to their department — unlike
  ordinary course assignments, which are not retroactive by default.
- **FR-008**: System MUST provide HR/Admin a compliance dashboard showing completed-vs-outstanding
  counts, per compliance-required course, across the active workforce.
- **FR-009**: System MUST retain completion history for an employee even after the underlying
  course is archived or the employee is offboarded.
- **FR-010**: System MUST let HR/Admin create a new assignment cycle for a course an employee has
  already completed (e.g., for an annual refresher), without that prior completion blocking the
  new assignment.

### Key Entities

- **Course**: A named learning item — description, external content reference, whether it
  requires proof-of-completion, and whether it's compliance-required.
- **Course assignment**: A course assigned to one employee, with a due date, status (incomplete/
  complete/overdue), and completion date if applicable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: HR can create and assign a course to a group in under 3 minutes.
- **SC-002**: An employee can mark a course complete in under 30 seconds (excluding any required
  proof-upload time).
- **SC-003**: HR can determine full compliance-course completion status across the company in a
  single dashboard view, in under 15 seconds.
- **SC-004**: 100% of new employees during acceptance testing are automatically included in
  already-active compliance-required course assignments relevant to them.
- **SC-005**: Zero cases, during testing, of a completion being accepted for a course requiring
  proof without that proof being attached.

## Assumptions

- This feature tracks assignment and completion; it does not host, stream, or author actual
  course content — content lives externally (an LMS, a video host, a document) and is referenced
  by link.
- Automated quizzes/knowledge checks are out of scope for v1.2; "completion" is either a
  self-attestation or a required proof-of-completion upload.
- Ordinary (non-compliance) course assignments are not retroactively applied to employees who
  join after the assignment was made — only compliance-required assignments are, per FR-007 —
  since routine training relevance may have changed by the time a new hire joins.
- Depends on Employee Management (002) for assignment audiences and Authentication & RBAC (001)
  for HR/Admin-only course management; pairs naturally with Document Management (008) for
  proof-of-completion storage but does not require it to function.
