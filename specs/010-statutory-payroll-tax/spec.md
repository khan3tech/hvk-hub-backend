# Feature Specification: Statutory Payroll Tax & Compliance

**Feature Branch**: `010-statutory-payroll-tax`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Statutory tax withholding and a compliant payslip — this was explicitly excluded from the original payroll spec (004) as 'structure and payslip generation only.' This feature supersedes that exclusion and adds real statutory deductions to the payslip."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR configures the statutory deduction rules that apply to the company (Priority: P1)

Before any payslip reflects statutory deductions, HR/Admin sets up which statutory components
apply (e.g., a provident-fund-style retirement contribution, a social-insurance contribution, a
regional professional tax, income tax withholding) and their calculation rule.

**Why this priority**: Nothing downstream — a compliant payslip or a filing-ready report — is
possible without the rules to compute from.

**Independent Test**: Configure one statutory component with a simple percentage-of-basic rule
and confirm it's saved and available to apply during a payroll run.

**Acceptance Scenarios**:

1. **Given** HR/Admin configuring statutory settings, **When** they define a statutory component
   with a name and a calculation rule (flat amount, percentage of basic, or a slab/bracket
   table), **Then** it's saved as an available deduction for future payroll runs.
2. **Given** an existing statutory component, **When** HR/Admin updates its rule effective a
   future date, **Then** past payroll periods keep using the rule that was in effect at the time
   they ran.
3. **Given** a non-HR/Admin user, **When** they attempt to view or edit statutory configuration,
   **Then** the action is refused.

---

### User Story 2 - Payroll run applies statutory deductions to each payslip (Priority: P1)

When HR runs payroll for a period, each employee's payslip now includes the applicable statutory
deductions computed from the configured rules and that employee's salary structure, alongside the
existing gross-to-net breakdown from Payroll (004).

**Why this priority**: This is the actual point of the feature — a payslip that reflects
statutory withholding, not just gross salary components.

**Independent Test**: Run payroll for one period with statutory components configured, and
confirm each payslip's deductions include the statutory amounts, computed correctly for that
employee's salary.

**Acceptance Scenarios**:

1. **Given** an active statutory component and an employee's salary structure, **When** payroll
   runs for a period, **Then** that employee's payslip deductions include the computed statutory
   amount, itemized separately from any non-statutory deductions.
2. **Given** an employee explicitly exempted from a statutory component (e.g., below an income
   threshold), **When** payroll runs, **Then** that component is correctly excluded from their
   payslip.
3. **Given** a payslip with statutory deductions, **When** an Employee views it, **Then** each
   statutory line item is clearly labeled and distinguishable from non-statutory deductions.

---

### User Story 3 - HR generates a statutory compliance report for a period (Priority: P2)

HR/Admin exports a summary report of total statutory liability for a period — how much was
withheld for each statutory component, across all employees — in a form usable for external
filing or handoff to an accountant.

**Why this priority**: The reporting/export step depends on P1 (deductions actually being
computed) already existing, and is the step that makes this genuinely "compliance-ready" rather
than just per-employee math.

**Independent Test**: After running payroll for a period with statutory deductions applied,
generate the compliance report and confirm it totals correctly against the sum of individual
payslip statutory line items for that period.

**Acceptance Scenarios**:

1. **Given** a completed payroll run with statutory deductions, **When** HR/Admin generates the
   compliance report for that period, **Then** it shows, per statutory component, the total
   amount withheld across all employees.
2. **Given** a generated compliance report, **When** HR/Admin exports it, **Then** they receive a
   downloadable file suitable for sharing outside the system.
3. **Given** a period that has been re-run after a correction, **When** HR/Admin regenerates the
   compliance report for that period, **Then** it reflects the corrected totals, not the
   original ones.

### Edge Cases

- What happens when a statutory rule uses income brackets/slabs (progressive rates) rather than a
  flat percentage? The system MUST support a bracket-based rule as a configuration option, not
  only flat-rate or flat-amount rules.
- What happens if HR changes a statutory rule mid-period, after payroll has already run for that
  period? The already-generated payslips MUST NOT change until payroll is explicitly re-run for
  that period.
- What happens for an employee who joins or exits partway through a period with statutory
  deductions? The statutory amount MUST be computed on the prorated pay for that partial period,
  consistent with Payroll (004)'s existing proration behavior.
- How does the system handle a jurisdiction whose statutory rules aren't pre-built into the
  system? HR/Admin MUST be able to define an arbitrary new statutory component from the generic
  rule types rather than being limited to a fixed, hardcoded list.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let HR/Admin define a statutory component with a name, a calculation
  rule type (flat amount, percentage of a salary component, or income brackets), and an effective
  date.
- **FR-002**: System MUST retain a statutory component's prior rule versions so past payroll
  periods remain explainable using the rule in effect at the time.
- **FR-003**: System MUST let HR/Admin mark a specific employee exempt from a specific statutory
  component.
- **FR-004**: System MUST compute each active, non-exempt statutory component's deduction for
  every employee during a payroll run, using that employee's salary structure and the rule in
  effect for the period being run.
- **FR-005**: System MUST itemize statutory deductions separately from non-statutory deductions
  on every payslip.
- **FR-006**: System MUST let HR/Admin generate a compliance report for a completed payroll
  period, totaling each statutory component's withheld amount across all employees.
- **FR-007**: System MUST let HR/Admin export the compliance report as a downloadable file.
- **FR-008**: System MUST recompute statutory deductions correctly when a payroll period is
  re-run, consistent with Payroll (004)'s existing re-run/replace behavior.
- **FR-009**: System MUST restrict statutory configuration (creating/editing components and
  exemptions) to HR/Admin only.
- **FR-010**: System MUST prorate a statutory deduction consistently with the underlying salary
  proration for an employee joining or exiting partway through a period.

### Key Entities

- **Statutory component**: A named, configurable deduction type (e.g., a retirement contribution,
  a social-insurance contribution, a regional tax, income tax withholding) with a calculation
  rule, effective-dated, with prior versions retained.
- **Statutory exemption**: A record marking one employee exempt from one statutory component.
- **Compliance report**: A generated, per-period summary totaling each statutory component's
  withheld amount across all employees, exportable as a file.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: HR can configure a new statutory component in under 5 minutes.
- **SC-002**: 100% of payslips generated during acceptance testing with an active statutory
  component correctly itemize that component's amount, verified against manual calculation.
- **SC-003**: The compliance report's totals match the sum of individual payslip statutory line
  items for the same period with zero discrepancy, across all test scenarios.
- **SC-004**: HR can produce an exportable compliance report for a completed period in a single
  action, in under 1 minute.

## Assumptions

- **This feature does not itself guarantee legal compliance with any specific jurisdiction.** It
  provides a configurable framework (flat, percentage, and bracket-based rules) that HR/Admin (or
  a qualified accountant/compliance advisor) configures to match the rules that actually apply to
  the company's jurisdiction; the system computes according to that configuration.
- Illustrative statutory components an organization might configure include a retirement/pension
  contribution, a social/health insurance contribution, a regional or local tax, and progressive
  income-tax withholding — the system does not hardcode any single country's specific scheme.
- Government e-filing integration (submitting withheld amounts directly to a tax authority) is
  out of scope for v1.1; the compliance report is an export for manual or accountant-assisted
  filing.
- Employee-side annual tax declarations/investment proofs (common in some jurisdictions' income
  tax withholding) are out of scope for v1.1; income-bracket withholding is computed from salary
  alone.
- This feature extends Payroll (004) directly and supersedes that spec's original "statutory tax
  filing/compliance is out of scope" exclusion for the specific capabilities described here.
