# Feature Specification: Background Verification

**Feature Branch**: `022-background-verification`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "A formal background/reference check step before offer or hire in the recruitment pipeline — currently a candidate can move straight from interview to offer with no verification checkpoint."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR initiates a background check for a candidate nearing offer (Priority: P1)

Once a candidate's application reaches a point where the company wants to verify their
background, HR/Admin initiates a check covering a defined set of items (e.g., employment
history, education, references) and tracks it against that application.

**Why this priority**: This is the entry point the rest of the feature depends on — no
verification record exists until one is initiated.

**Independent Test**: Initiate a background check on an application in the offer stage with two
check items, and confirm it appears attached to that application as pending.

**Acceptance Scenarios**:

1. **Given** an application at or near the offer stage, **When** HR/Admin initiates a background
   check specifying which items to verify, **Then** it's created and attached to that
   application as pending.
2. **Given** an application without a background check, **When** HR/Admin attempts to move it to
   "hired," **Then** the system requires a completed background check first, or an explicit
   HR/Admin override with reason recorded.
3. **Given** a candidate with a background check in progress, **When** anyone views the
   application, **Then** the check's status is visible alongside the pipeline stage.

---

### User Story 2 - HR records the outcome of each verification item (Priority: P1)

HR/Admin (or a designated verifier) records a result — cleared, flagged, or unable to verify —
for each item in the check, with supporting notes, and the overall check is marked complete once
every item has a result.

**Why this priority**: This is the operational core — initiating a check that never gets results
recorded provides no actual verification value.

**Independent Test**: Record a result for each item on an in-progress check and confirm it
automatically becomes complete once the last item is recorded, with an overall outcome derived
from the items.

**Acceptance Scenarios**:

1. **Given** an in-progress background check, **When** HR/Admin records a result for one item,
   **Then** that item shows the result and any notes, while the check as a whole remains in
   progress until every item has one.
2. **Given** every item on a check has a recorded result, **When** the last one is recorded,
   **Then** the check's overall status becomes complete, with an overall outcome (cleared /
   flagged) derived from whether any item was flagged.
3. **Given** a completed check with a flagged item, **When** HR/Admin views the application,
   **Then** the flag is clearly visible before any hiring decision is finalized.

---

### User Story 3 - HR decides how to proceed based on the check outcome (Priority: P2)

Once a background check completes, HR/Admin makes an explicit decision — proceed to hire despite
a flag (with a justification recorded), or reject the application because of it — rather than
the flag silently sitting unresolved.

**Why this priority**: Closes the loop from "a flag was found" to "a decision was made about
it," but the check itself (P1) already delivers the verification value even before this explicit
decision step.

**Independent Test**: Complete a check with a flagged item, then record an explicit
proceed-with-justification decision, and confirm both the decision and justification are saved
on the record.

**Acceptance Scenarios**:

1. **Given** a completed check with no flagged items, **When** HR/Admin moves the application to
   "hired," **Then** no additional justification is required.
2. **Given** a completed check with a flagged item, **When** HR/Admin moves the application to
   "hired" anyway, **Then** the system requires a written justification before allowing it.
3. **Given** a completed check with a flagged item, **When** HR/Admin instead rejects the
   application, **Then** the rejection is recorded consistent with Recruitment/ATS (005)'s
   existing rejection handling, with the check's flag retained as context.

### Edge Cases

- What happens if a candidate's background check is still pending when HR wants to extend an
  offer? The system MUST allow the offer stage to proceed in parallel (offers are often
  conditional on clearance) but MUST still block final "hired" status until the check is
  resolved or explicitly overridden.
- What happens if a check item comes back as "unable to verify" (e.g., a previous employer
  doesn't respond)? This MUST be a distinct result from both cleared and flagged, visible as its
  own state rather than defaulting to either extreme.
- What happens if HR needs to add an additional check item after the check has already started?
  HR/Admin MUST be able to add items to an in-progress check; doing so reverts the check's overall
  status from complete back to in-progress if it had already finished.
- Who can see background check results? Visibility MUST be restricted to HR/Admin only — not the
  hiring department Manager, since this is sensitive personal information handled separately from
  ordinary pipeline visibility in Recruitment/ATS (005).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let HR/Admin initiate a background check on an application, specifying
  one or more items to verify.
- **FR-002**: System MUST let HR/Admin (or a designated verifier) record a result — cleared,
  flagged, or unable to verify — with notes, for each item on an in-progress check.
- **FR-003**: System MUST automatically mark a check complete once every item has a recorded
  result, with an overall outcome derived from whether any item was flagged.
- **FR-004**: System MUST let HR/Admin add an additional item to an in-progress check, and MUST
  revert a completed check to in-progress if an item is added after completion.
- **FR-005**: System MUST prevent an application from being marked "hired" while its background
  check is incomplete, unless HR/Admin performs an explicit override with a recorded reason.
- **FR-006**: System MUST require a written justification before allowing an application with a
  flagged, completed check to be marked "hired."
- **FR-007**: System MUST NOT require justification to proceed when a completed check has no
  flagged items.
- **FR-008**: System MUST restrict visibility of background check items, results, and notes to
  HR/Admin only.
- **FR-009**: System MUST retain a completed background check's full item-level history on the
  application record for audit purposes.

### Key Entities

- **Background check**: One verification effort attached to one Application — status (pending/
  in progress/complete), overall outcome (cleared/flagged), and its check items.
- **Check item**: One thing being verified (e.g., "employment history," "education," "reference
  from [name]") with a result (cleared/flagged/unable to verify) and notes.
- **Hire override**: A recorded justification allowing an application to proceed to "hired"
  despite an incomplete or flagged check.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: HR can initiate a background check with multiple items in under 2 minutes.
- **SC-002**: 100% of checks during acceptance testing correctly transition to complete only once
  every item has a recorded result.
- **SC-003**: Zero cases, during testing, of an application reaching "hired" with a flagged,
  completed check and no recorded justification.
- **SC-004**: Zero cases, during testing, of a Manager (non-HR/Admin) accessing background check
  detail through any pipeline view.

## Assumptions

- Integration with a third-party background-check vendor (automated employment/criminal/education
  verification services) is out of scope for v1.2; results are recorded manually by HR/Admin
  based on checks conducted outside the system.
- A standard, company-wide set of default check items is configurable, but which items apply to a
  given application is chosen per-initiation rather than automatically inferred from the posting
  or role.
- This feature extends Recruitment/ATS (005) directly, attaching to its existing Application
  entity, and does not change any of that spec's pipeline-stage behavior beyond the new
  "hired" gate described here.
