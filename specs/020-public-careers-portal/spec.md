# Feature Specification: Public Careers Page & Candidate Self-Apply

**Feature Branch**: `020-public-careers-portal`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "An external-facing careers page and candidate self-application portal — Recruitment/ATS (005) is explicitly internal-only today; this is the public counterpart."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A prospective candidate browses open roles publicly (Priority: P1)

Anyone on the internet, without an account, visits a public careers page and sees the company's
currently open job postings.

**Why this priority**: This is the entire premise of the feature — without a public listing,
there's no external candidate pipeline to self-apply into.

**Independent Test**: With a mix of open, on-hold, and closed postings in the system, visit the
public careers page anonymously and confirm only open postings are listed.

**Acceptance Scenarios**:

1. **Given** open job postings exist, **When** anyone visits the public careers page, **Then**
   they see each open posting's title, department, and a brief description, with no account
   required.
2. **Given** a posting that is on hold or closed, **When** the public page is viewed, **Then**
   that posting does not appear.
3. **Given** a posting that becomes closed while someone has its detail page open, **When** they
   attempt to apply, **Then** the system prevents the application and explains the role is no
   longer accepting applicants.

---

### User Story 2 - A candidate applies to a role without an internal account (Priority: P1)

A candidate submits their name, contact details, and a resume directly against an open posting,
and their application enters the same pipeline HR already manages internally (005).

**Why this priority**: This is what turns a listing page into an actual acquisition channel — a
posting that can be viewed but not applied to delivers no recruiting value.

**Independent Test**: Submit a self-application as an anonymous candidate and confirm it appears
in HR's internal pipeline (005) at the first stage, identical to a candidate HR would have
entered manually.

**Acceptance Scenarios**:

1. **Given** an open posting's detail page, **When** a candidate submits their details, contact
   info, and resume, **Then** a Candidate and Application are created and appear in HR's
   internal pipeline at the first stage.
2. **Given** a candidate who already applied to a specific posting, **When** they attempt to
   apply to that same posting again, **Then** the system prevents the duplicate, consistent with
   Recruitment/ATS (005).
3. **Given** a submitted application, **When** the candidate finishes submitting, **Then** they
   see a confirmation that their application was received.

---

### User Story 3 - A candidate checks their application status without HR involvement (Priority: P2)

A candidate who applied returns later and checks whether their application has moved, without
needing to email HR to ask.

**Why this priority**: Reduces status-inquiry overhead for HR and improves candidate experience,
but the pipeline already functions and delivers value (P1) without this self-check capability.

**Independent Test**: Apply as a candidate, have HR move the application's stage internally, then
check status externally using the same contact details and confirm it reflects the current
stage.

**Acceptance Scenarios**:

1. **Given** a submitted application, **When** the candidate checks status using their email and
   a reference from their application confirmation, **Then** they see the application's current
   stage (or a simplified public-facing version of it).
2. **Given** an application moved to a terminal stage (hired/rejected), **When** the candidate
   checks status, **Then** they see that outcome clearly stated.
3. **Given** someone attempting to check status with contact details that don't match any
   application, **When** they submit the check, **Then** they see a generic "no matching
   application found" message that doesn't reveal whether that email applied elsewhere.

### Edge Cases

- What happens if the same person applies to multiple different open postings? Each application
  MUST be tracked independently, consistent with Recruitment/ATS (005) — this is not a
  duplicate.
- What happens if a public applicant submits an unsupported resume file type or an oversized
  file? The system MUST reject the upload with a clear, specific error before submission
  succeeds.
- How is spam/automated bulk submission prevented on a public, unauthenticated form? The
  submission flow MUST include a bot-mitigation step (e.g., a challenge) before an application is
  accepted.
- What happens to a candidate's data if they want it removed after applying? HR/Admin MUST be
  able to delete a candidate's public-submitted record on request, consistent with standard data-
  subject request handling.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a public, unauthenticated page listing every currently open
  job posting with title, department, and description.
- **FR-002**: System MUST exclude on-hold and closed postings from the public listing.
- **FR-003**: System MUST let an unauthenticated visitor submit a self-application to an open
  posting with name, contact details, and a resume attachment.
- **FR-004**: System MUST route a public self-application into the same internal pipeline
  Recruitment/ATS (005) already manages, at that pipeline's first stage.
- **FR-005**: System MUST prevent a duplicate self-application from the same candidate to the
  same posting, consistent with Recruitment/ATS (005)'s existing duplicate-prevention rule.
- **FR-006**: System MUST reject a public self-application to a posting that has become closed
  or on-hold since the visitor loaded its detail page.
- **FR-007**: System MUST include a bot-mitigation step on the public application form.
- **FR-008**: System MUST let a candidate check their own application's status externally using
  their submitted contact details, without an internal account.
- **FR-009**: System MUST return a generic, non-revealing response when a status check doesn't
  match any application, rather than confirming or denying whether that email applied elsewhere.
- **FR-010**: System MUST let HR/Admin delete a public-submitted candidate's record on request.
- **FR-011**: System MUST reject a resume upload that exceeds a configured size limit or uses an
  unsupported file type.

### Key Entities

This feature reuses Recruitment/ATS (005)'s existing Job Posting, Candidate, and Application
entities directly — a public self-application is not a separate kind of record, it's the same
Application entity created through a public rather than internal entry point.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A prospective candidate can find and view an open posting's details in under 30
  seconds from landing on the careers page.
- **SC-002**: A candidate can complete a self-application in under 5 minutes.
- **SC-003**: 100% of self-applications submitted during acceptance testing appear correctly in
  HR's internal pipeline within the same session.
- **SC-004**: Zero duplicate applications for the same candidate/posting pair accepted during
  testing, across both public and internal submission paths.
- **SC-005**: Zero cases, during testing, of a status check revealing whether a given email
  applied to a posting other than the one being checked.

## Assumptions

- Candidate accounts (a persistent login for applicants to track multiple applications over
  time) are out of scope for v1.2; status checking is a lightweight, per-application lookup, not
  a full account experience.
- SEO optimization, custom domain/branding for the careers page, and structured-data job listings
  for search engines are reasonable future extensions but not functional requirements here.
- This feature is the public-facing counterpart to Recruitment/ATS (005) and depends on it
  entirely for pipeline behavior; it adds an entry point, not new pipeline logic.
- Multi-tenant careers pages (each organization having its own public page once 015 is active)
  are assumed but not detailed here — see 015's own scope for tenant-level isolation.
