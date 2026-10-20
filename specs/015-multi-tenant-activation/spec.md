# Feature Specification: Multi-Company / Multi-Tenant Activation

**Feature Branch**: `015-multi-tenant-activation`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Turn the existing orgId-per-table seam into an actual sellable multi-tenant product — more than one company using the same deployment, each seeing only their own data."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A new company signs up and gets its own isolated organization (Priority: P1)

A new customer company is provisioned as a new organization in the system, with its own first
Admin user, completely isolated from every other organization's data.

**Why this priority**: This is the foundational capability the entire feature exists to deliver —
without organization creation and isolation, there is no multi-tenancy, only a single-tenant
system with an unused column.

**Independent Test**: Provision two separate organizations, create an employee in each, and
confirm a user from one organization cannot see, search, or reach the other organization's
employee in any list or direct lookup.

**Acceptance Scenarios**:

1. **Given** a new company signing up, **When** their organization is provisioned, **Then** a new,
   isolated organization is created with its own first Admin account.
2. **Given** two separate organizations each with employees, **When** a user from one signs in,
   **Then** every list, search, and direct record lookup they perform returns only their own
   organization's data.
3. **Given** an Admin in one organization, **When** they attempt to directly access another
   organization's record by guessing or reusing an identifier, **Then** the request is refused.

---

### User Story 2 - Every existing module continues to work correctly, scoped per organization (Priority: P1)

Attendance, leave, payroll, and recruitment all continue functioning exactly as specified in
their original specs (002–005), but every operation is implicitly scoped to the acting user's own
organization.

**Why this priority**: Multi-tenancy is only real if it holds under every existing feature, not
just the employee directory — this is the correctness bar for the whole effort.

**Independent Test**: Run parallel scenarios (leave approval, a payroll run, a recruitment
pipeline move) in two separate organizations at the same time, and confirm neither organization's
actions or data leak into the other's.

**Acceptance Scenarios**:

1. **Given** two organizations each running payroll for the same period, **When** both runs
   execute, **Then** each organization's payslips are generated independently, with zero
   cross-organization data mixing.
2. **Given** two organizations each with their own department/designation/leave-type lookup
   lists, **When** a user in one organization views those lists, **Then** they see only their own
   organization's configured values, never the other's.
3. **Given** a Manager approving leave in one organization, **When** they view their approval
   queue, **Then** it contains only requests from their own organization's employees.

---

### User Story 3 - A super-admin (system operator) manages organizations across the whole deployment (Priority: P2)

Someone operating the system itself — not a member of any single customer company — can view the
list of organizations, suspend one (e.g., for non-payment), and see basic usage metrics per
organization.

**Why this priority**: Necessary for running the system as an actual multi-tenant product at
scale, but the product is already functionally multi-tenant per User Stories 1–2 without this
operator tooling.

**Independent Test**: As a super-admin, view the organization list, suspend one, and confirm every
user in that organization is immediately blocked from signing in while other organizations are
unaffected.

**Acceptance Scenarios**:

1. **Given** a super-admin, **When** they view the organization list, **Then** they see every
   organization with basic identifying info and status (active/suspended).
2. **Given** a super-admin, **When** they suspend an organization, **Then** every user in that
   organization is blocked from signing in, with a clear message, while all other organizations
   continue operating normally.
3. **Given** a suspended organization, **When** a super-admin reactivates it, **Then** its users
   can sign in again immediately.
4. **Given** a super-admin, **When** they view an organization's basic usage (e.g., employee
   count, last activity), **Then** the figures reflect only that organization's data.

### Edge Cases

- What happens if a bug or a future feature accidentally omits an organization filter on a query?
  This is treated as the highest-severity class of defect for this feature — see Success
  Criteria — and MUST be caught by automated testing that specifically checks for
  cross-organization leakage on every existing module's endpoints.
- What happens to the single organization seeded for v0.1 when this feature activates? It MUST
  continue operating exactly as before, becoming "organization one of many" rather than requiring
  data migration or re-entry.
- What happens if two organizations happen to pick identical-looking data (e.g., the same
  department name, "Engineering")? They MUST remain entirely independent records — no
  deduplication or sharing occurs across organizations.
- How does a super-admin authenticate, given they aren't a member of any single organization's
  RBAC structure? Super-admin is a distinct, system-level access tier, separate from the four
  per-organization roles (Admin/HR/Manager/Employee) defined in Authentication & RBAC (001).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let a system operator provision a new, isolated organization with its
  own first Admin account.
- **FR-002**: System MUST scope every list, search, and direct-lookup operation across every
  existing module (employee, attendance, leave, payroll, recruitment) to the acting user's own
  organization.
- **FR-003**: System MUST refuse any attempt, by any non-super-admin role, to access a record
  belonging to a different organization, including by direct identifier reference.
- **FR-004**: System MUST scope all configuration/lookup data (departments, designations, leave
  types, holidays, statutory components) per organization, independently editable by each
  organization's own HR/Admin.
- **FR-005**: System MUST provide a distinct super-admin access tier, separate from the four
  per-organization roles, for system-level operation.
- **FR-006**: System MUST let a super-admin view the list of all organizations with basic
  identifying information and status.
- **FR-007**: System MUST let a super-admin suspend an organization, immediately blocking sign-in
  for every user in that organization, and reactivate it, immediately restoring access.
- **FR-008**: System MUST let a super-admin view basic per-organization usage figures (e.g.,
  employee count, last activity) without exposing that organization's actual HR data content.
- **FR-009**: System MUST preserve the existing v0.1 seeded organization's data and function
  unchanged once multi-tenancy is activated.
- **FR-010**: System MUST be verifiable, via automated tests covering every existing module's
  endpoints, to never return or accept data across an organization boundary.

### Key Entities

- **Organization**: A tenant — a company using the system, with its own users, employees, and all
  other data, isolated from every other organization. Already represented by the `orgId` column
  present on every core table per Constitution Principle VI; this feature is what makes that
  column load-bearing.
- **Super-admin**: A system-level operator account, not tied to any single organization,
  authorized to manage organizations themselves rather than any organization's HR data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero cross-organization data leakage observed across an automated test suite
  exercising every existing module's endpoints with two or more organizations present.
- **SC-002**: A new organization can be provisioned and its first Admin able to sign in within a
  few minutes of the provisioning action.
- **SC-003**: Suspending an organization blocks 100% of that organization's users from signing in
  within the same session, with zero impact on other organizations' sign-in during testing.
- **SC-004**: The pre-existing (v0.1) organization's data and functionality are verified
  unchanged (byte-for-byte record count parity) immediately after this feature activates.

## Assumptions

- Self-service company sign-up (a public registration flow) is out of scope for v1.1; organization
  provisioning is performed by a system operator on request.
- Per-organization billing/subscription management is out of scope for this feature; suspension
  is a manual super-admin action, not tied to an automated billing system.
- Cross-organization reporting or benchmarking (e.g., comparing anonymized attrition across
  customers) is explicitly out of scope and would raise separate data-handling questions not
  addressed here.
- This feature is the direct fulfillment of Constitution Principle VI (Multi-Tenancy Readiness)
  and touches every other spec (001–014) by adding an organization-scoping requirement to each,
  without changing any of their functional behavior within a single organization.
