# Feature Specification: Asset & Expense Management

**Feature Branch**: `014-asset-expense-management`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Laptop/equipment assignment tied to onboarding/offboarding, plus basic expense reimbursement claims."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR/IT tracks company assets and who holds them (Priority: P1)

HR/Admin (or an IT owner role) maintains a record of company equipment — laptops, monitors,
phones — and who each item is currently assigned to.

**Why this priority**: Nothing else in the asset half of this feature works without an inventory
to assign from and check against.

**Independent Test**: Add one asset, assign it to an employee, and confirm it shows as assigned on
both the asset record and that employee's profile.

**Acceptance Scenarios**:

1. **Given** HR/Admin, **When** they add a new asset with a description and identifier (e.g.,
   serial number), **Then** it appears in the asset inventory as unassigned.
2. **Given** an unassigned asset, **When** HR/Admin assigns it to an employee, **Then** it
   appears on that employee's profile and is marked assigned in the inventory.
3. **Given** an asset already assigned to someone, **When** HR/Admin attempts to assign it to a
   second employee without first unassigning it, **Then** the system prevents the conflict.

---

### User Story 2 - Asset assignment and return are tied to onboarding and exit (Priority: P1)

A new hire's onboarding checklist includes an asset-assignment task that's satisfied by actually
assigning an asset to them; an exiting employee's exit checklist includes an asset-return task
that's satisfied by marking their assets returned.

**Why this priority**: This is what makes asset tracking part of the operational HR flow instead
of a disconnected spreadsheet — directly closes a gap left by Onboarding (007) and Resignation &
Exit (009).

**Independent Test**: Assign an asset as part of completing a new hire's onboarding
asset-assignment task, then later mark it returned as part of that same employee's exit
checklist, and confirm the inventory reflects unassigned again.

**Acceptance Scenarios**:

1. **Given** a new hire's onboarding checklist with an asset-assignment task, **When** HR/IT
   assigns them an asset, **Then** that onboarding task is marked complete.
2. **Given** an exiting employee's exit checklist with an asset-return task, **When** HR/IT marks
   their assigned assets returned, **Then** the exit task is marked complete and the assets
   return to unassigned in the inventory.
3. **Given** an exiting employee with unreturned assets, **When** HR/Admin attempts to fully
   offboard them, **Then** the incomplete asset-return task blocks it, consistent with Resignation
   & Exit Management (009).

---

### User Story 3 - Employee submits an expense claim and it's approved for reimbursement (Priority: P2)

An Employee submits a reimbursement claim with an amount, a category, and a receipt; their
Manager (or HR/Admin) approves or rejects it, and approved claims are visible to Finance/HR for
payout tracking.

**Why this priority**: A separate, independently useful capability from asset tracking; ranked
P2 because it's valuable but not blocking the asset-lifecycle value already delivered by User
Stories 1–2.

**Independent Test**: Submit one expense claim with a receipt attached, approve it as a Manager,
and confirm it appears in a payout-tracking view as approved and unpaid.

**Acceptance Scenarios**:

1. **Given** an Employee, **When** they submit an expense claim with an amount, category, and
   receipt, **Then** it appears in their manager's approval queue as pending.
2. **Given** a pending expense claim, **When** the Manager approves it, **Then** its status
   becomes approved and it appears in HR/Finance's payout-tracking view.
3. **Given** a pending expense claim, **When** the Manager rejects it with a reason, **Then** the
   Employee sees the reason and the claim does not appear in payout tracking.
4. **Given** an approved claim, **When** HR/Admin marks it paid, **Then** its status updates to
   paid and it's excluded from the outstanding-payout list.

### Edge Cases

- What happens if an asset is lost or damaged rather than simply returned? HR/IT MUST be able to
  mark an asset's status as lost/damaged (removing it from the assignable pool) independent of
  the return flow.
- What happens if an employee submits an expense claim without a receipt for a category that
  requires one? The system MUST block submission and explain that a receipt is required.
- What happens if an employee's manager changes while they have a pending expense claim? The
  pending claim MUST become visible to the new manager's approval queue, consistent with the
  reporting-line handling in Attendance & Leave (003).
- What happens when an asset assignment is needed but no matching onboarding task exists (e.g.,
  a later equipment refresh, unrelated to onboarding)? HR/IT MUST be able to assign/reassign
  assets freely at any time, independent of any checklist.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let HR/Admin (or an IT owner role) add an asset to a company inventory
  with a description and unique identifier.
- **FR-002**: System MUST let HR/Admin assign an unassigned asset to an employee, and prevent
  assigning an already-assigned asset without first unassigning it.
- **FR-003**: System MUST let HR/Admin mark an asset returned (making it unassigned again) or
  lost/damaged (removing it from the assignable pool).
- **FR-004**: System MUST show, on an employee's profile, the assets currently assigned to them.
- **FR-005**: System MUST satisfy an onboarding checklist's asset-assignment task automatically
  when an asset is assigned to that employee as part of onboarding.
- **FR-006**: System MUST satisfy an exit checklist's asset-return task automatically when all of
  that employee's assigned assets are marked returned.
- **FR-007**: System MUST let an Employee submit an expense claim with an amount, a category, and
  a receipt attachment.
- **FR-008**: System MUST require a receipt for expense categories configured as requiring one,
  and block submission without it.
- **FR-009**: System MUST route an expense claim to the employee's direct manager for approval,
  with HR/Admin able to decide on any claim regardless of reporting line.
- **FR-010**: System MUST require a reason when an expense claim is rejected, visible to the
  submitter.
- **FR-011**: System MUST let HR/Admin mark an approved claim as paid, and MUST distinguish
  approved-unpaid from paid in any payout-tracking view.

### Key Entities

- **Asset**: A piece of company equipment — description, unique identifier, status
  (unassigned/assigned/lost/damaged), and current assignee if any.
- **Asset assignment**: A record linking one asset to one employee for a period, with assignment
  and (if applicable) return dates.
- **Expense claim**: An employee's reimbursement request — amount, category, receipt, status
  (pending/approved/rejected/paid), and approver.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: HR/IT can assign an asset to an employee in under 1 minute.
- **SC-002**: 100% of asset-assignment and asset-return onboarding/exit tasks during acceptance
  testing are correctly auto-completed when the corresponding asset action occurs.
- **SC-003**: An Employee can submit an expense claim in under 2 minutes.
- **SC-004**: Zero cases, during testing, of the same asset being simultaneously assigned to two
  employees.
- **SC-005**: HR/Finance can determine total outstanding (approved-unpaid) reimbursement liability
  in a single view, in under 15 seconds.

## Assumptions

- Direct payment/disbursement integration for expense reimbursement is out of scope for v1.1;
  "marked paid" is a status update, not a money movement, consistent with how Payroll (004)
  treats payslips.
- Per-category spending limits and multi-level expense approval chains are out of scope for
  v1.1; one approver (manager or HR/Admin) decides each claim.
- Asset depreciation/valuation tracking is out of scope for v1.1; assets are tracked for
  assignment purposes only, not as financial/accounting records.
- This feature depends on Employee Onboarding (007) and Resignation & Exit Management (009) for
  the checklist-task integration, and on Employee Management (002) for reporting-line-based
  expense approval routing, but the core asset inventory and expense-claim flows function even
  without 007/009 present.
