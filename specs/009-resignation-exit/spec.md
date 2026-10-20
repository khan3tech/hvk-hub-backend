# Feature Specification: Resignation & Exit Management

**Feature Branch**: `009-resignation-exit`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "A formal resignation flow — notice period, exit interview, clearance from IT/Finance/HR — instead of offboarding being just a status flip on the employee record."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Employee submits a resignation (Priority: P1)

An Employee formally resigns through the app, specifying their intended last working day, which
starts a defined exit process instead of a side conversation that never gets recorded.

**Why this priority**: This is the trigger for everything else in the feature — no resignation
record, no exit process to track.

**Independent Test**: Submit a resignation as an Employee and confirm it appears, pending
acceptance, to their Manager and HR with the requested last working day.

**Acceptance Scenarios**:

1. **Given** an active Employee, **When** they submit a resignation with a proposed last working
   day, **Then** a resignation record is created and visible to their Manager and HR as pending.
2. **Given** a pending resignation, **When** the Employee views their own status, **Then** they
   see it clearly marked pending until a Manager or HR acknowledges it.
3. **Given** an Employee who already has an active pending resignation, **When** they attempt to
   submit a second one, **Then** the system prevents a duplicate.

---

### User Story 2 - Manager/HR acknowledges the resignation and the notice period is tracked (Priority: P1)

A Manager or HR acknowledges the resignation, optionally adjusting the last working day (e.g., to
match a standard notice period), and the employee's status reflects "serving notice" until that
date.

**Why this priority**: Without acknowledgment and a tracked notice period, the resignation is
just a note — this is what makes it an operational process with a clear end date.

**Independent Test**: Acknowledge a pending resignation, confirm/adjust the last working day, and
confirm the employee's status updates to "serving notice" with that date visible company-wide
where relevant (e.g., to their team).

**Acceptance Scenarios**:

1. **Given** a pending resignation, **When** a Manager or HR acknowledges it, **Then** its status
   becomes "serving notice" and the confirmed last working day is recorded.
2. **Given** an acknowledged resignation, **When** the confirmed last working day differs from
   the employee's original request, **Then** both dates remain visible for reference.
3. **Given** an employee serving notice, **When** their last working day passes, **Then** HR is
   prompted that the exit clearance and offboarding steps are due.

---

### User Story 3 - HR runs exit clearance and completes offboarding (Priority: P1)

Before an employee's final day, HR coordinates clearance across the relevant checklist owners
(IT for asset return, Finance for final settlement, HR for exit interview) and only fully
offboards the employee once clearance is complete.

**Why this priority**: This is the operational core of "exit management" — equally critical as
starting the process, since an incomplete exit (unreturned assets, an unresolved settlement) is
the actual risk being managed.

**Independent Test**: Progress an employee's exit checklist from resignation through full
clearance and confirm the employee is only marked offboarded once every clearance task is
complete.

**Acceptance Scenarios**:

1. **Given** an acknowledged resignation, **When** it's acknowledged, **Then** an exit checklist
   is created with clearance tasks owned by IT, Finance, and HR.
2. **Given** an exit checklist with incomplete tasks, **When** HR attempts to mark the employee
   fully offboarded, **Then** the system blocks it and shows which tasks remain.
3. **Given** an exit checklist where every task is complete, **When** HR marks the employee
   offboarded, **Then** the employee's status becomes offboarded and their access is revoked
   (per Authentication & RBAC).
4. **Given** an exit interview task, **When** HR records exit-interview notes, **Then** they are
   saved on the resignation record, visible only to HR/Admin.

### Edge Cases

- What happens if an employee withdraws their resignation before their last working day? HR MUST
  be able to mark the resignation withdrawn, reverting the employee to active status and closing
  the exit checklist without offboarding them.
- What happens if an employee's last working day arrives but exit clearance is still incomplete?
  The system MUST still allow HR to force-offboard for access-revocation/security reasons, but
  MUST keep the incomplete clearance tasks visible and open for follow-up rather than silently
  closing them.
- What happens if a resigning employee is also someone else's manager? The system MUST flag their
  direct reports as needing manager reassignment before or as part of the exit checklist.
- What happens to leave requests or payroll periods spanning the exit date? Those remain governed
  by Attendance & Leave (003) and Payroll (004) as already specified — this feature only tracks
  the exit process itself.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let an active Employee submit a resignation with a proposed last
  working day.
- **FR-002**: System MUST prevent an employee from having more than one active (pending or
  serving-notice) resignation at a time.
- **FR-003**: System MUST let a Manager or HR/Admin acknowledge a pending resignation and confirm
  (optionally adjusting) the last working day.
- **FR-004**: System MUST reflect an acknowledged resignation as a distinct employee status
  ("serving notice") visible to the employee, their manager, and HR/Admin.
- **FR-005**: System MUST automatically create an exit checklist upon acknowledgment, with
  clearance tasks assigned to IT, Finance, and HR owner roles.
- **FR-006**: System MUST prevent marking an employee fully offboarded while any exit checklist
  task remains incomplete, unless HR/Admin explicitly overrides for access-revocation reasons.
- **FR-007**: System MUST let HR/Admin record exit interview notes on the resignation record,
  visible only to HR/Admin.
- **FR-008**: System MUST let HR/Admin mark a resignation withdrawn, reverting the employee's
  status to active and closing the associated exit checklist.
- **FR-009**: System MUST flag, during exit checklist creation, any direct reports of a resigning
  manager as needing reassignment.
- **FR-010**: System MUST revoke the employee's system access at the point they are marked fully
  offboarded, consistent with Authentication & RBAC (001).
- **FR-011**: System MUST retain the full resignation and exit-checklist history for an
  offboarded employee, visible to HR/Admin, for audit purposes.

### Key Entities

- **Resignation**: One record per resignation attempt — employee, proposed last working day,
  confirmed last working day, status (pending/serving notice/withdrawn/completed), exit interview
  notes.
- **Exit checklist**: Created on acknowledgment — a set of clearance tasks (IT asset return,
  Finance settlement, HR exit formalities) that must all complete before final offboarding.
- **Exit task**: A single clearance item — owner role, completion state, who completed it and
  when.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An employee can submit a resignation in under 1 minute.
- **SC-002**: 100% of employees marked fully offboarded during acceptance testing had a complete
  exit checklist at the time, except cases using the explicit HR override.
- **SC-003**: HR can determine exactly which clearance tasks remain for any exiting employee in a
  single view, in under 15 seconds.
- **SC-004**: Zero cases, during testing, of an offboarded employee retaining system access after
  being marked fully offboarded.
- **SC-005**: A withdrawn resignation correctly restores the employee to active status with zero
  residual "serving notice" indicators anywhere in the system.

## Assumptions

- Notice-period length policy (e.g., 30/60/90 days by role) is configured by HR per resignation
  rather than enforced automatically by a company-wide rule engine in v1.1.
- Final settlement calculation (pending dues, gratuity where applicable) is recorded as a
  clearance task outcome here, not computed by this feature — actual computation remains a
  Payroll (004) concern if/when extended to support it.
- This feature depends on Employee Management (002) for the employee record and status, on
  Authentication & RBAC (001) for access revocation, and pairs with Document Management (008) for
  storing signed exit paperwork, though it does not require 008 to function.
- Rehiring a former employee (reusing their historical record) is out of scope for v1.1; a
  returning employee is treated as a new hire.
