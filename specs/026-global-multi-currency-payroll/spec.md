# Feature Specification: Global / Multi-Currency Payroll

**Feature Branch**: `026-global-multi-currency-payroll`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Extends Statutory Payroll Tax & Compliance (010) for distributed teams across countries — multiple currencies and multiple countries' statutory rule sets in one company."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR assigns each employee a payroll country and currency (Priority: P1)

HR/Admin sets, per employee, which country's payroll rules and which currency their salary
structure and payslips are expressed in — instead of the whole company being assumed to be one
country and one currency.

**Why this priority**: Nothing else in the feature is possible without knowing which country/
currency context each employee's payroll belongs to — this is the foundational data point.

**Independent Test**: Set two employees to different countries/currencies and confirm each one's
salary structure form subsequently uses that country's configured statutory components and that
currency's formatting.

**Acceptance Scenarios**:

1. **Given** HR/Admin editing an employee's payroll settings, **When** they select a country and
   currency, **Then** that employee's salary structure and future payslips use that country's
   statutory components (per Statutory Payroll Tax & Compliance, 010) and that currency.
2. **Given** an employee with no payroll country/currency set, **When** payroll attempts to
   process them, **Then** the system blocks their payslip generation and clearly reports the
   missing configuration, rather than assuming a default silently.
3. **Given** an employee whose country/currency changes (e.g., an internal transfer), **When**
   HR/Admin updates it effective a future date, **Then** past payslips remain in their original
   currency/country context, unaffected.

---

### User Story 2 - HR runs a single payroll period across multiple countries at once (Priority: P1)

HR/Admin triggers one payroll run for a period, and the system correctly applies each employee's
own country's statutory rules and currency, producing a properly localized payslip for every
employee regardless of country, in one action.

**Why this priority**: This is the actual point of the feature — running payroll per-country
manually defeats the purpose; one run correctly handling every country is what makes it "global
payroll" rather than several disconnected single-country systems.

**Independent Test**: Run payroll for one period across employees in two different configured
countries and confirm each employee's payslip reflects their own country's statutory components
and currency, with no cross-country mixing.

**Acceptance Scenarios**:

1. **Given** active employees across two or more configured countries, **When** HR/Admin runs
   payroll for a period, **Then** each employee's payslip is computed using their own country's
   statutory rules and expressed in their own currency.
2. **Given** a payroll run's summary, **When** HR/Admin views it, **Then** results are grouped or
   at least clearly labeled by country, not blended into one undifferentiated total.
3. **Given** a country with employees but no statutory components configured for it (per 010),
   **When** payroll runs, **Then** those employees are skipped with a clear reason, consistent
   with Payroll (004)'s existing skip-and-report behavior.

---

### User Story 3 - HR views total payroll cost converted to a single reporting currency (Priority: P2)

For company-wide reporting purposes, HR/Admin sees total payroll cost across all countries
converted into one chosen reporting currency, using a recorded exchange rate for that period.

**Why this priority**: A leadership-reporting convenience that depends on P1/P2 already
producing correct per-country payslips; not required for payroll itself to run correctly across
countries.

**Independent Test**: With payslips generated in two currencies for one period, view the
reporting-currency total and confirm it matches manual conversion using the recorded exchange
rate for that period.

**Acceptance Scenarios**:

1. **Given** HR/Admin sets a company reporting currency, **When** they view total payroll cost
   for a period, **Then** it shows the sum of all payslips converted to that currency using an
   exchange rate recorded for that period.
2. **Given** a completed period's reporting-currency total, **When** that period is later
   re-run (per Payroll, 004's existing re-run behavior), **Then** the reporting total reflects
   the corrected payslips, not the stale ones.
3. **Given** no exchange rate recorded for a given period/currency pair, **When** HR/Admin
   attempts to view the reporting total, **Then** the system clearly indicates the rate is
   missing rather than silently omitting or misconverting that currency's contribution.

### Edge Cases

- What happens if an employee's salary structure was defined before a country/currency was
  assigned? Payroll MUST block generating their payslip until both a salary structure and a
  country/currency are set — this is the same "cleanly skip and report" behavior as a missing
  salary structure alone in Payroll (004).
- What happens if HR needs to add a new country's statutory rule set mid-year? HR/Admin MUST be
  able to configure a new country's statutory components (per 010) at any time, with existing
  employees in other countries entirely unaffected.
- What happens to an already-generated payslip if the underlying exchange rate is corrected
  later? The individual payslip's own currency amount MUST remain unchanged (it was correct in
  its own currency); only the reporting-currency conversion for aggregate views is affected, and
  only after a new rate is recorded.
- How does the system handle an organization that only ever operates in one country? This
  feature MUST impose no additional configuration burden on a single-country organization beyond
  what Payroll (004) and Statutory Payroll Tax (010) already require — multi-country is additive,
  not a forced complication.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let HR/Admin assign each employee a payroll country and currency.
- **FR-002**: System MUST block payslip generation for an employee with no payroll country/
  currency configured, reporting this clearly rather than defaulting silently.
- **FR-003**: System MUST apply the statutory components configured for an employee's assigned
  country (per Statutory Payroll Tax & Compliance, 010) when computing their payslip.
- **FR-004**: System MUST express each employee's salary structure and payslip amounts in their
  assigned currency.
- **FR-005**: System MUST support a single payroll run correctly processing employees across
  multiple countries/currencies at once, with no cross-country data mixing.
- **FR-006**: System MUST skip and clearly report employees in a country with no statutory
  components configured, consistent with Payroll (004)'s existing skip-and-report behavior for
  missing configuration.
- **FR-007**: System MUST retain a payslip's original currency and country context unaffected by
  later changes to an employee's country/currency assignment.
- **FR-008**: System MUST let HR/Admin designate a company reporting currency and record an
  exchange rate for each other currency used, per period.
- **FR-009**: System MUST compute a total payroll cost across all countries, converted to the
  reporting currency, using the recorded rate for that period.
- **FR-010**: System MUST clearly indicate when a reporting-currency total cannot be fully
  computed due to a missing exchange rate, rather than silently omitting that currency's
  contribution.
- **FR-011**: System MUST impose no additional required configuration on an organization
  operating in a single country/currency beyond what Payroll (004) and Statutory Payroll Tax
  (010) already require.

### Key Entities

- **Payroll country/currency assignment**: Per employee — which country's statutory rules and
  which currency apply to their payroll.
- **Exchange rate record**: A recorded conversion rate between one currency and the company's
  reporting currency, for a specific period.
- **Reporting-currency total**: A derived, per-period aggregate — not stored as a source of
  truth, always computed from underlying payslips and the recorded rates for that period.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: HR can configure a new country/currency assignment for an employee in under 1
  minute.
- **SC-002**: A single payroll run across three or more countries during acceptance testing
  produces correctly localized payslips for 100% of employees with complete configuration.
- **SC-003**: Zero cases, during testing, of one country's statutory components being applied to
  an employee assigned to a different country.
- **SC-004**: The reporting-currency total matches manual conversion using the recorded rate with
  zero discrepancy, across all test scenarios with a rate present.
- **SC-005**: A single-country organization's setup burden is unchanged (zero new required steps)
  when this feature is active but unused, verified during testing.

## Assumptions

- Automated, live exchange-rate fetching is out of scope for v1.2; rates are recorded manually by
  HR/Admin per period.
- This feature extends Statutory Payroll Tax & Compliance (010) and Payroll (004) directly and
  assumes both are present; it does not duplicate their core computation logic, only adds the
  country/currency dimension across them.
- Country-specific payment/disbursement methods (e.g., local bank rails) remain out of scope,
  consistent with Payroll (004)'s existing "produces payslip records, does not move money" scope.
- Multi-tenant currency isolation (each organization under Multi-Tenant Activation, 015, choosing
  its own reporting currency independently) is assumed but not detailed here — see 015 for
  tenant-level isolation guarantees.
