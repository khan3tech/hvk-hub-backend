# Phase 1 Data Model: Employee Management

All models this feature needs already exist in `apps/api/prisma/schema.prisma` (added up front
per constitution Principle VI). This feature adds no new models and no migration — it documents
how the existing `Employee`, `Department`, `Designation`, and `User` models are read/written by
this feature's service layer.

## Employee (existing model, used not modified)

Relevant fields (see schema.prisma for the full model — other modules' relations are omitted
here as out of this feature's concern):

| Field | Type | Used by this feature as |
|---|---|---|
| `id` | `String @id` | Primary key; also the "self" reference point for R2's cycle check. |
| `orgId` | `String` | Every query in this feature scopes by this (Principle VI). |
| `employeeCode` | `String` | Generated at creation per research.md R1; `@@unique([orgId, employeeCode])`. |
| `name` | `String` | FR-001 required field. |
| `email` | `String` | FR-001 required field; `@@unique([orgId, email])`; also becomes the linked `User.email`. |
| `departmentId` | `String?` | FR-001 required at creation per spec (nullable in schema for flexibility; this feature's create form requires it). |
| `designationId` | `String?` | Same as above. |
| `managerId` | `String?` | Self-relation (`EmployeeManager`); optional for top-level roles (spec FR-001). Validated per research.md R2 before write. |
| `dateOfJoining` | `DateTime` | FR-001 required field. |
| `status` | `EmployeeStatus` (`ACTIVE` \| `OFFBOARDED`) | FR-007/FR-008; only transition is `ACTIVE → OFFBOARDED`, never reversed in this feature (no "reboard" flow — out of scope, see 009 for resignation/rehire). |
| `user` | `User?` (inverse of `User.employeeId`) | The linked login account provisioned per research.md R4. |

**Validation rules** (enforced in `modules/employee/service.ts`):
- `name`, `email`, `departmentId`, `designationId`, `dateOfJoining` required on create (FR-001).
- `email` must be a valid, org-unique email (schema constraint backstops this; service layer
  gives a friendly `VALIDATION_ERROR` instead of a raw Prisma unique-constraint error).
- `managerId`, if provided, MUST NOT equal the employee's own `id` (direct case) and MUST NOT
  create a cycle when walking up the candidate's own `managerId` chain (research.md R2).
- `managerId`, if provided, MUST reference an employee whose `status = ACTIVE` (spec Edge Cases
  — reject assigning an offboarded manager).
- `status` can only be changed via the dedicated offboard action (research.md R5), never via the
  general update endpoint, so offboarding always goes through its audit-logged, session-revoking
  path — never a silent `PATCH { status: "OFFBOARDED" }`.

**State transitions**:
```
ACTIVE --offboard action (HR/Admin only)--> OFFBOARDED
OFFBOARDED --(no transition back in this feature)-->
```

## Department (existing model, used not modified)

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | Primary key. |
| `orgId` | `String` | Scope. |
| `name` | `String` | `@@unique([orgId, name])`; FR-009 lookup list. |
| `headEmployeeId` | `String?` | Not required by this feature's scope (no "department head" UI in spec's user stories) — left null/unused by this feature; available for a later feature to populate. |

**Validation rules**: `name` required, unique per org (FR-009 — HR/Admin can create).

## Designation (existing model, used not modified)

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | Primary key. |
| `orgId` | `String` | Scope. |
| `title` | `String` | `@@unique([orgId, title])`; FR-009 lookup list. |
| `level` | `Int?` | Optional seniority ordering; not required by any acceptance scenario — left optional, settable at creation if HR provides it. |

**Validation rules**: `title` required, unique per org (FR-009).

## User (existing model, new usage: provisioned by this feature)

This feature creates a `User` row (not just reads one) as part of `POST /employees` — see
research.md R4. Fields set at creation:

| Field | Value set by this feature |
|---|---|
| `orgId` | Same as the new `Employee.orgId`. |
| `email` | Same as the new `Employee.email` (kept in sync; the create endpoint takes one email for both). |
| `passwordHash` | bcrypt hash (cost 12) of a randomly generated temporary password, returned once in the API response (research.md R4) — never stored or logged in plaintext. |
| `role` | `EMPLOYEE` unless the create request explicitly specifies another role (HR/Admin only path — see contracts/employee-api.md). |
| `employeeId` | The newly created `Employee.id`. |

No other `User` fields (`failedLoginAttempts`, `lockedAt`, etc. — all 001's concerns) are touched
by this feature.

## ActivityLog (existing model, new usage)

No schema change. This feature writes these `action` values:
- `action: "employee.created"` — on every new employee, `entity: "Employee"`.
- `action: "employee.updated"` — on department/designation/manager change, `entity: "Employee"`,
  `before`/`after` capturing the changed fields only (FR-011).
- `action: "employee.offboarded"` — on offboarding, `entity: "Employee"`, `before: { status:
  "ACTIVE" }`, `after: { status: "OFFBOARDED" }` (FR-011, spec User Story 3).

`actorId` is the calling HR/Admin user's `employeeId` — same open point already flagged in
001's data-model.md (a system-administrator `User` with no linked `Employee` can't be attributed
this way); this feature inherits that same known gap rather than re-solving it.
