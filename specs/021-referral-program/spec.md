# Feature Specification: Employee Referral Program

**Feature Branch**: `021-referral-program`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Employee-sourced candidates tracked into the ATS pipeline, with a referral bonus payable through Payroll — referrals are one of the highest-quality hiring channels and currently have no structured path into the system."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Employee refers a candidate for an open posting (Priority: P1)

An Employee submits someone they know for a specific open posting, and that referral is tracked
as the reason the resulting candidate/application entered the pipeline.

**Why this priority**: This is the entry point the entire feature depends on — without a
referral record linking an employee to a candidate, there's nothing to track a bonus against
later.

**Independent Test**: Submit a referral as an Employee for an open posting, and confirm a
Candidate and Application are created in the internal pipeline (005), tagged with that employee
as the referrer.

**Acceptance Scenarios**:

1. **Given** an Employee, **When** they submit a referral (candidate name, contact info, resume)
   for a specific open posting, **Then** a Candidate and Application are created in the pipeline,
   tagged with that employee as referrer.
2. **Given** an Employee, **When** they view their own referrals, **Then** they see each one's
   current pipeline stage, without seeing other confidential pipeline detail (e.g., interview
   feedback) they aren't otherwise entitled to.
3. **Given** a candidate already referred (or already an applicant via another channel) for a
   posting, **When** an Employee attempts to refer them again for the same posting, **Then** the
   system prevents the duplicate, consistent with Recruitment/ATS (005).

---

### User Story 2 - A referral bonus is tracked as the referred candidate progresses (Priority: P1)

As a referred candidate moves through the pipeline, the referral record tracks progress toward a
bonus, and the bonus becomes payable once the candidate is hired and (per company policy) has
stayed a minimum period.

**Why this priority**: This is what makes it a "referral program" rather than just a tagged
application — the incentive mechanism is the reason employees participate.

**Independent Test**: Move a referred candidate's application to "hired," confirm the referral
shows a bonus as pending until the configured qualifying period elapses, then confirm it becomes
payable.

**Acceptance Scenarios**:

1. **Given** a referred candidate whose application reaches "hired," **When** that happens,
   **Then** the referral record shows a bonus as pending, tied to a configured qualifying period.
2. **Given** a referral bonus in its qualifying period, **When** the referred hire's employment
   is still active once that period elapses, **Then** the bonus becomes payable.
3. **Given** a referred hire who exits (resigns or is offboarded) before the qualifying period
   elapses, **When** that happens, **Then** the bonus is marked forfeited rather than payable.
4. **Given** a referred candidate's application is rejected rather than hired, **When** that
   happens, **Then** the referral record closes with no bonus, clearly reflecting the outcome to
   the referring employee.

---

### User Story 3 - HR processes a payable referral bonus through Payroll (Priority: P2)

HR/Admin reviews payable referral bonuses and includes them as a one-off addition on the
referring employee's next payslip.

**Why this priority**: Closes the loop from "bonus earned" to "bonus paid," but the program
already delivers its core tracking value (P1) without this integration being automatic.

**Independent Test**: With a payable referral bonus on record, include it on the referring
employee's next payroll run and confirm it appears as a distinct earning line on their payslip.

**Acceptance Scenarios**:

1. **Given** a payable referral bonus, **When** HR/Admin views the payroll run screen for the
   referring employee's next period, **Then** they can include it as a one-off earning.
2. **Given** a referral bonus included in a payroll run, **When** the payslip is generated,
   **Then** it appears as a clearly labeled, distinct earning line, separate from regular salary
   components.
3. **Given** a referral bonus already included in a completed payroll run, **When** HR/Admin
   views the referral record, **Then** it's marked paid and cannot be included again in a future
   run.

### Edge Cases

- What happens if an employee refers a candidate who is also independently applying through the
  public careers portal (020) or another channel around the same time? The system MUST attribute
  the referral to whichever channel created the Application record first, consistent with the
  existing one-application-per-candidate-per-posting rule in Recruitment/ATS (005).
- What happens if the referring employee themselves is offboarded before the bonus becomes
  payable? HR/Admin MUST be able to see this and decide manually whether the bonus is still paid
  out (e.g., as a final payment) — the system does not automatically forfeit a bonus solely
  because the referrer left.
- What happens if company policy has no qualifying period at all (bonus payable immediately on
  hire)? The system MUST support a zero-length qualifying period as a valid configuration.
- What happens if HR needs to change the referral bonus amount after some referrals are already
  in progress? Only new referrals MUST use the updated amount; in-progress referrals keep the
  amount that applied when they were submitted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let an Employee submit a referral (candidate details, resume) for a
  specific open posting, creating a Candidate and Application in the same pipeline
  Recruitment/ATS (005) manages, tagged with the referring employee.
- **FR-002**: System MUST prevent a duplicate referral/application for the same candidate and
  posting pair.
- **FR-003**: System MUST let an Employee view their own referrals' pipeline stage without
  exposing confidential pipeline detail they aren't otherwise entitled to see.
- **FR-004**: System MUST let HR/Admin configure a referral bonus amount and a qualifying period
  (which may be zero) that applies to new referrals going forward.
- **FR-005**: System MUST mark a referral bonus pending when its associated application reaches
  "hired," and payable once the qualifying period elapses with the hire still active.
- **FR-006**: System MUST mark a referral bonus forfeited if the referred hire exits before the
  qualifying period elapses.
- **FR-007**: System MUST close a referral with no bonus if its associated application reaches a
  rejected outcome instead of hired.
- **FR-008**: System MUST let HR/Admin include a payable referral bonus as a one-off earning on
  the referring employee's payroll run, itemized separately from regular salary components on
  the resulting payslip.
- **FR-009**: System MUST mark a referral bonus paid once included in a completed payroll run,
  and prevent it from being included again.
- **FR-010**: System MUST retain the bonus amount and qualifying period that applied at the time
  a referral was submitted, unaffected by later configuration changes.

### Key Entities

- **Referral**: A record linking a referring Employee to a Candidate/Application, with a bonus
  amount, qualifying period, and status (pending/payable/paid/forfeited/closed-no-bonus).
- **Referral program configuration**: The current bonus amount and qualifying period applied to
  new referrals.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An Employee can submit a referral in under 3 minutes.
- **SC-002**: 100% of referred candidates who reach "hired" during acceptance testing correctly
  generate a pending bonus record.
- **SC-003**: Zero cases, during testing, of a forfeited bonus (due to early exit) being
  incorrectly marked payable or paid.
- **SC-004**: HR can include a payable bonus on a payroll run and see it correctly itemized on
  the resulting payslip in a single payroll-run action.
- **SC-005**: Zero cases, during testing, of the same referral bonus being included in more than
  one payroll run.

## Assumptions

- Referral bonus amounts are a single company-wide configured value in v1.2, not tiered by role,
  seniority, or posting difficulty; per-posting bonus amounts are a reasonable future extension.
- Automatic payout (money movement) is out of scope, consistent with Payroll (004)'s existing
  scope — "paid" means included on a generated payslip, not a disbursed transaction.
- Depends on Recruitment/ATS (005) for the pipeline a referral enters, Employee Management (002)
  for the referring employee's active/offboarded status, and Payroll (004) for including the
  bonus as an earning; pairs naturally with the Public Careers Portal (020) for the
  channel-attribution edge case, but does not require it to function.
