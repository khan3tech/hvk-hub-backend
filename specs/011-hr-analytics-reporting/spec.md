# Feature Specification: HR Analytics & Reporting Dashboards

**Feature Branch**: `011-hr-analytics-reporting`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Headcount, attrition, leave-trend, and payroll-cost views for HR/Admin — turning the data already collected by the other modules into decision-ready dashboards instead of leaving it locked in individual records."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR views a company-wide headcount and org overview (Priority: P1)

HR/Admin opens a dashboard showing current headcount, broken down by department and
designation, and how it has changed over recent months.

**Why this priority**: Headcount is the single most-asked HR question ("how many people do we
have, and where") and requires no other analytics feature to be useful on its own.

**Independent Test**: With a populated set of employees across departments, open the dashboard
and confirm the headcount total and department breakdown match a manual count.

**Acceptance Scenarios**:

1. **Given** active employees across multiple departments, **When** HR opens the headcount
   dashboard, **Then** they see a total count and a breakdown by department that matches the
   underlying employee records.
2. **Given** a date range selector, **When** HR selects a past range, **Then** the headcount
   trend line reflects joins and offboardings that occurred within that range.
3. **Given** an offboarded employee, **When** HR views current headcount, **Then** that employee
   is excluded from the active total but still counted in historical trend data for the period
   they were active.

---

### User Story 2 - HR views attrition and tenure trends (Priority: P1)

HR/Admin sees how many employees have left over a period, broken down by department, alongside
average tenure, to spot patterns worth investigating.

**Why this priority**: Attrition is the second most common HR leadership question and is
foundational to retention decisions — equally load-bearing as headcount.

**Independent Test**: With a mix of active and offboarded employees with known offboarding dates,
open the attrition view and confirm the count and rate for a selected period match a manual
calculation.

**Acceptance Scenarios**:

1. **Given** employees offboarded within a selected period, **When** HR views the attrition
   dashboard, **Then** they see a count and rate (offboarded ÷ average headcount) for that
   period.
2. **Given** attrition broken down by department, **When** HR views the dashboard, **Then** each
   department's contribution to overall attrition is visible separately.
3. **Given** an employee record with a joining and offboarding date, **When** HR views the
   average tenure figure, **Then** that employee's tenure is correctly included in the
   calculation.

---

### User Story 3 - HR views leave-usage and payroll-cost trends (Priority: P2)

HR/Admin sees aggregate leave-usage patterns (which leave types are used most, by which
departments) and how total payroll cost has trended across recent pay periods.

**Why this priority**: Valuable operational and budgeting insight, but depends on Attendance &
Leave (003) and Payroll (004) already having accumulated history — ranked after the two
org-level views that are useful from day one.

**Independent Test**: With leave requests and at least two completed payroll runs on record, open
each view and confirm the totals reconcile against the underlying leave and payslip records.

**Acceptance Scenarios**:

1. **Given** approved leave requests across leave types, **When** HR views the leave-usage
   dashboard, **Then** they see total days used per leave type, and can filter by department.
2. **Given** at least two completed payroll periods, **When** HR views the payroll-cost trend,
   **Then** they see total net pay per period, plotted across periods.
3. **Given** a payroll period that was re-run after a correction, **When** HR views the
   payroll-cost trend, **Then** it reflects the corrected total, not the original one.

### Edge Cases

- What happens when there isn't enough historical data yet to show a trend (e.g., a brand-new
  company with one payroll period)? The dashboard MUST show the data that exists rather than an
  error, with a clear note that trend context will build up over time.
- How does the system handle a Manager attempting to access these dashboards? Company-wide
  analytics are HR/Admin only; a Manager does not get a scoped-down version of these dashboards
  in v1.1 (see Assumptions).
- What happens if department or designation data is incomplete for some employees (e.g., no
  department assigned)? Those employees MUST appear in an explicit "unassigned" bucket rather
  than being silently dropped from totals.
- What happens when the same underlying data changes after a dashboard has been viewed (e.g., an
  employee is offboarded after the dashboard loaded)? The next time the dashboard is opened or
  refreshed, it MUST reflect the current state — dashboards are not required to update live while
  left open.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide HR/Admin a headcount dashboard showing current total
  headcount and a breakdown by department and designation.
- **FR-002**: System MUST let HR/Admin select a date range and see headcount trend (joins minus
  offboardings) over that range.
- **FR-003**: System MUST provide HR/Admin an attrition dashboard showing count and rate of
  offboardings for a selected period, broken down by department.
- **FR-004**: System MUST compute and display average employee tenure across the current active
  workforce.
- **FR-005**: System MUST provide HR/Admin a leave-usage view showing total days used per leave
  type, filterable by department.
- **FR-006**: System MUST provide HR/Admin a payroll-cost trend view showing total net pay per
  completed payroll period.
- **FR-007**: System MUST reflect a corrected (re-run) payroll period's totals in the
  payroll-cost trend, not the original pre-correction totals.
- **FR-008**: System MUST group employees with missing department or designation data into an
  explicit "unassigned" bucket in all relevant breakdowns, rather than omitting them.
- **FR-009**: System MUST restrict all dashboards described in this spec to HR/Admin roles.
- **FR-010**: System MUST let HR/Admin export any dashboard's underlying data as a downloadable
  file for use outside the system.

### Key Entities

- **Dashboard**: A named analytics view (headcount, attrition, leave usage, payroll cost) composed
  from existing Employee, Attendance & Leave, and Payroll records — this feature introduces no
  new source-of-truth data, only aggregation and presentation over what already exists.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: HR can answer "how many people do we have, by department" without leaving a single
  screen, in under 10 seconds.
- **SC-002**: Attrition rate and average tenure figures match manual calculation with zero
  discrepancy across all acceptance test scenarios.
- **SC-003**: HR can export any dashboard's data in under 30 seconds without needing to manually
  compile it from individual records.
- **SC-004**: Zero employees are silently omitted from any dashboard's totals due to missing
  department/designation data during acceptance testing — all appear, correctly bucketed.

## Assumptions

- Dashboards in v1.1 are HR/Admin only; Manager-scoped analytics (e.g., a Manager's own team's
  attrition) are deferred to a later pass.
- Dashboards are read-only aggregations refreshed on load/manual refresh; real-time/live-updating
  charts are out of scope for v1.1.
- Predictive analytics (e.g., attrition-risk scoring) are out of scope for this feature; see
  Performance Management (012) and future AI-assisted features for that direction.
- This feature depends on Employee Management (002), Attendance & Leave (003), and Payroll (004)
  as its data sources, and has no data of its own beyond dashboard configuration.
