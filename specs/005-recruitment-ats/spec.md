# Feature Specification: Recruitment / ATS

**Feature Branch**: `005-recruitment-ats`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "An internal applicant tracking pipeline — job postings, candidates, a staged application pipeline, and interview rounds. Not a public careers site."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR opens a job posting (Priority: P1)

HR creates an internal record of an open role — title, department, number of openings — so
candidates can start being tracked against it.

**Why this priority**: Every candidate and application in this feature is tracked against a
posting; nothing else can exist without one.

**Independent Test**: Create one job posting and confirm it appears in the postings list with
its status and opening count — delivers standalone value as a simple open-roles tracker.

**Acceptance Scenarios**:

1. **Given** an HR user, **When** they create a job posting with a title, department, and number
   of openings, **Then** it appears in the postings list with status "open."
2. **Given** an existing posting, **When** HR changes its status (e.g., to "on hold" or
   "closed"), **Then** the new status is reflected everywhere the posting is referenced.
3. **Given** a Manager, **When** they view postings for their own department, **Then** they see
   them but cannot create or edit postings themselves.

---

### User Story 2 - HR adds a candidate and applies them to a posting (Priority: P1)

HR records a candidate's basic details and their resume, then links them to one or more open
postings as an application.

**Why this priority**: This is the core data-entry step that populates the pipeline — the
feature has no content without it.

**Independent Test**: Add one candidate, apply them to one posting, and confirm the application
appears at the first pipeline stage for that posting.

**Acceptance Scenarios**:

1. **Given** an HR user, **When** they add a candidate with name, contact info, and a resume,
   **Then** the candidate record is saved and searchable.
2. **Given** an existing candidate, **When** HR applies them to an open posting, **Then** an
   application is created at the first pipeline stage for that posting.
3. **Given** a candidate already applied to a posting, **When** HR attempts to apply them to the
   same posting again, **Then** the system prevents the duplicate application.

---

### User Story 3 - HR (or a department Manager) moves a candidate through the pipeline (Priority: P1)

An application progresses through defined stages — applied, screening, interview, offer,
hired/rejected — as the hiring decision develops, and everyone involved can see where each
candidate stands.

**Why this priority**: This is the operational core of an ATS — a pipeline that doesn't move
isn't tracking anything.

**Independent Test**: Move one application from "applied" through to "hired" or "rejected," one
stage at a time, and confirm the board/list view reflects the current stage after each move.

**Acceptance Scenarios**:

1. **Given** an application at any stage, **When** HR or the relevant department's Manager moves
   it to the next stage, **Then** the application's stage updates immediately and is visible to
   everyone with access to that posting.
2. **Given** an application, **When** it's moved to "hired," **Then** it's clearly marked as a
   final, successful outcome distinct from every other stage.
3. **Given** an application, **When** it's moved to "rejected" from any stage, **Then** it's
   clearly marked as a final outcome and no further stage progression is offered.
4. **Given** a Manager, **When** they attempt to move an application for a posting outside their
   own department, **Then** the action is refused.

---

### User Story 4 - HR schedules an interview round and the interviewer records feedback (Priority: P2)

For an application in the interview stage, HR schedules a round with a specific employee as
interviewer; that interviewer later records their result/feedback.

**Why this priority**: Adds necessary structure to the "interview" stage but the pipeline is
already functional (P1) without it — interviews could otherwise be tracked as a single freeform
stage.

**Independent Test**: Schedule an interview round for an application, assign an interviewer, and
confirm that interviewer (and only that interviewer, plus HR/Admin) can record a result for it.

**Acceptance Scenarios**:

1. **Given** an application in the interview stage, **When** HR schedules a round with an
   interviewer and a time, **Then** the round appears on that application's record and is
   visible to the assigned interviewer.
2. **Given** a scheduled interview round, **When** the assigned interviewer records a result,
   **Then** it's saved and visible to HR/Admin and the relevant department Manager.
3. **Given** an employee who is not the assigned interviewer, **When** they attempt to record a
   result for that round, **Then** the action is refused.
4. **Given** an application, **When** multiple interview rounds have been scheduled and
   completed, **Then** all rounds and their results are visible together on that application.

### Edge Cases

- What happens when a posting is closed while it still has open applications in progress? Those
  applications MUST remain visible and actionable (e.g., to still reject or hire) even though the
  posting itself no longer accepts new applications.
- What happens if HR tries to move an application backward in the pipeline (e.g., from
  "interview" back to "applied")? The system MUST support this as a correction, since hiring
  decisions are sometimes revisited, but MUST record the change for audit purposes.
- What happens when the same candidate applies to two different postings at once? Each
  application MUST be tracked independently with its own stage.
- What happens if an interviewer assigned to a round is later offboarded before the interview
  happens? HR MUST be able to reassign the round to a different interviewer.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let HR/Admin create a job posting with title, department, status, and
  number of openings.
- **FR-002**: System MUST let HR/Admin update a posting's status (open, on hold, closed) and
  opening count.
- **FR-003**: System MUST let HR/Admin add a candidate with name, contact information, and a
  resume/attachment.
- **FR-004**: System MUST let HR/Admin apply an existing candidate to an open posting, creating
  an application at the pipeline's first stage.
- **FR-005**: System MUST prevent the same candidate from being applied to the same posting more
  than once.
- **FR-006**: System MUST support a defined, ordered set of pipeline stages that every
  application progresses through (applied → screening → interview → offer → hired/rejected).
- **FR-007**: System MUST let HR/Admin move an application to any stage, including backward, and
  MUST record each stage change for audit purposes.
- **FR-008**: System MUST let a department Manager move applications only for postings within
  their own department.
- **FR-009**: System MUST treat "hired" and "rejected" as terminal states that are visually
  distinct from in-progress stages.
- **FR-010**: System MUST let HR/Admin schedule an interview round for an application, assigning
  one internal employee as interviewer and a scheduled time.
- **FR-011**: System MUST let only the assigned interviewer (or HR/Admin) record a result for an
  interview round.
- **FR-012**: System MUST let HR/Admin reassign an interview round to a different interviewer.
- **FR-013**: System MUST let HR/Admin, and the relevant department Manager, view all interview
  rounds and results for an application.
- **FR-014**: System MUST let any authenticated user view the list of open postings; only
  HR/Admin (and, for their own department, Managers) may view full applicant/pipeline detail.

### Key Entities

- **Job posting**: An internal open role — title, department, status, number of openings.
- **Candidate**: A person being considered — name, contact info, resume/attachment — independent
  of any specific posting.
- **Application**: A candidate's link to one specific posting, carrying its own pipeline stage
  and history.
- **Interview round**: A scheduled interview for one application, with an assigned interviewer
  (an internal employee) and, once completed, a result.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: HR can open a new posting and apply an existing candidate to it in under 2 minutes
  combined.
- **SC-002**: Moving an application to a new pipeline stage is reflected to every viewer with
  access to that posting within the same session, with no stale views.
- **SC-003**: 100% of interview results recorded during acceptance testing are attributable to
  the correct, assigned interviewer, with zero cases of an unassigned employee successfully
  recording a result.
- **SC-004**: Zero duplicate applications for the same candidate/posting pair observed during
  acceptance testing.
- **SC-005**: A department Manager never sees or actions a posting/application outside their own
  department, verified across all test scenarios.

## Assumptions

- There is no public-facing careers page or external candidate self-application portal in v0.1 —
  all candidate and application data entry is done internally by HR/Admin.
- Resume storage is limited to a single attached file per candidate; parsing/auto-extraction of
  resume content is out of scope for v0.1.
- Offer-letter generation and e-signature are out of scope for v0.1 — "offer" is tracked only as
  a pipeline stage, not a document workflow.
- Candidate-facing email notifications (e.g., automatic rejection emails) are out of scope for
  v0.1.
- The five pipeline stages listed in FR-006 are fixed for v0.1; per-posting custom pipelines are
  out of scope.
