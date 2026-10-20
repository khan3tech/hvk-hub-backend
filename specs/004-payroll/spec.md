# Feature Specification: Payroll

**Feature Branch**: `004-payroll`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Salary structures per employee, a monthly payroll run that generates payslips, and attendance-aware deductions for unpaid leave. Statutory tax filing/compliance is out of scope."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR defines an employee's salary structure (Priority: P1)

HR sets up how much an employee earns — a base amount plus a small set of standard components —
before any payslip can be generated for them.

**Why this priority**: Nothing else in payroll is possible without a salary structure to compute
from; it's the foundational input.

**Independent Test**: Create a salary structure for one employee and confirm it's retrievable and
editable — delivers value standalone as a compensation record even before a payroll run exists.

**Acceptance Scenarios**:

1. **Given** an employee with no salary structure yet, **When** HR sets one up with a base amount
   and standard components, **Then** it's saved and visible on that employee's payroll profile.
2. **Given** an employee with an existing salary structure, **When** HR updates it effective a
   future date, **Then** the previous structure remains on record for past periods and the new
   one applies from its effective date onward.
3. **Given** an Employee or Manager (not HR/Admin), **When** they attempt to view or edit a
   salary structure, **Then** editing is refused for both, and viewing is refused unless it is
   their own (Employee) or reserved for HR/Admin.

---

### User Story 2 - HR runs payroll for a period and generates payslips (Priority: P1)

Once a month, HR triggers a payroll run for all active employees; the system computes each
person's pay for that period — accounting for unpaid leave — and produces one payslip per
employee.

**Why this priority**: This is the entire point of the feature — turning salary structures and
attendance into an actual, deliverable pay record for the period.

**Independent Test**: Trigger a payroll run for one period with a small set of employees (some
with unpaid leave taken, some without) and confirm a payslip is generated for each, with the
unpaid-leave employee showing a proportionally reduced amount.

**Acceptance Scenarios**:

1. **Given** a period with active employees who all have salary structures, **When** HR runs
   payroll for that period, **Then** one payslip is generated per active employee reflecting
   their salary structure.
2. **Given** an employee who took unpaid leave during the period, **When** payroll runs for that
   period, **Then** their payslip reflects a proportional deduction for the unpaid days.
3. **Given** a period that has already been run, **When** HR runs payroll again for the same
   period (e.g., after fixing a salary structure), **Then** the existing payslips for that
   period are recalculated and replaced, not duplicated.
4. **Given** an employee with no salary structure defined, **When** payroll runs for a period
   that includes them, **Then** the system skips them and clearly reports which employees were
   skipped and why.

---

### User Story 3 - Employee views and downloads their own payslips (Priority: P2)

An Employee looks up their pay history and gets a copy of any past payslip for their own
records.

**Why this priority**: High-frequency, low-complexity self-service need — but depends on a
payroll run having already happened, so it's ranked after the run itself.

**Independent Test**: As an Employee, after at least one payroll run has occurred, view payslip
history and download one payslip — confirm no other employee's payslips are reachable.

**Acceptance Scenarios**:

1. **Given** an Employee with past payslips, **When** they open their payroll page, **Then**
   they see a list of all their own past payslips by period.
2. **Given** an Employee, **When** they open one of their payslips, **Then** they see a clear
   breakdown of earnings and deductions and can obtain a downloadable copy.
3. **Given** an Employee, **When** they attempt to reach another employee's payslip directly,
   **Then** the request is refused.
4. **Given** a Manager, **When** they view payslip information for their direct reports,
   **Then** they see it in view-only form, without the ability to edit anything.

### Edge Cases

- What happens if HR tries to edit or delete a payslip directly after it's been generated? The
  system MUST NOT allow direct edits — a payslip is only ever replaced by re-running payroll for
  that same period.
- What happens when an employee joins partway through a payroll period? Their first payslip MUST
  prorate for the partial period rather than paying a full period's salary.
- What happens when an employee is offboarded partway through a period? Their final payslip MUST
  prorate up to their last active day.
- How does the system handle a payroll run triggered twice in quick succession for the same
  period? The second run MUST safely recompute/replace rather than create duplicate payslips or
  double-charge anything.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let HR/Admin define a salary structure for an employee consisting of a
  base amount plus a small set of standard components (e.g., allowances), effective from a given
  date.
- **FR-002**: System MUST keep prior salary structures on record when a new one is set, so past
  payroll periods remain explainable using the structure that was in effect at the time.
- **FR-003**: System MUST let HR/Admin trigger a payroll run for a specified month/period across
  all active employees.
- **FR-004**: System MUST compute each employee's pay for the period from their salary structure,
  reduced proportionally for any unpaid leave days recorded in that period.
- **FR-005**: System MUST produce exactly one payslip per active employee per period, showing a
  clear breakdown of earnings and deductions and a net pay total.
- **FR-006**: System MUST make re-running payroll for an already-processed period replace that
  period's payslips rather than create duplicates.
- **FR-007**: System MUST prevent any direct edit to a generated payslip; changes require a
  payroll re-run for that period.
- **FR-008**: System MUST let an Employee view and obtain a copy of only their own payslips.
- **FR-009**: System MUST let a Manager view (not edit) payslip information for their direct
  reports only.
- **FR-010**: System MUST let HR/Admin view payslip information and salary structures for anyone
  in the company.
- **FR-011**: System MUST clearly report any employee skipped during a payroll run (e.g., missing
  salary structure) rather than silently omitting them.
- **FR-012**: System MUST prorate pay for an employee who joined or was offboarded partway
  through the period being run.

### Key Entities

- **Salary structure**: An employee's compensation definition — a base amount plus standard
  components — effective from a given date, with prior versions retained.
- **Payroll run**: The act of processing one period (month + year) for all active employees,
  producing or replacing that period's payslips.
- **Payslip**: One employee's finalized pay record for one period — earnings, deductions, and net
  pay — immutable once generated except by a full re-run of that period.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: HR can complete a full payroll run for the whole active workforce in a single
  action, with results available within a few minutes for a typical company size.
- **SC-002**: 100% of payslips generated in acceptance testing correctly prorate for unpaid leave
  where applicable, with zero discrepancies against manual calculation.
- **SC-003**: An Employee can locate and open any of their own past payslips in under 30 seconds.
- **SC-004**: Zero cases, across acceptance testing, of a payslip being directly edited outside of
  a full payroll re-run for its period.
- **SC-005**: Re-running payroll for an already-processed period never results in more than one
  payslip per employee for that period.

## Assumptions

- Statutory tax computation, filing, and compliance reporting are out of scope for this spec —
  "payroll" here means gross-to-net structure and payslip generation only, not jurisdiction-
  specific tax withholding. **Superseded in part by Statutory Payroll Tax & Compliance (010)**,
  which adds statutory deductions on top of the payslip this spec produces.
- Multiple currencies and multi-country payroll rules are out of scope for v0.1; one currency and
  one set of rules for a single organization.
- Direct bank-transfer / disbursement integration is out of scope for v0.1; payroll produces
  payslip records, it does not move money.
- Bonuses, reimbursements, and off-cycle payroll runs are out of scope for v0.1; only a single
  scheduled run per period is supported.
