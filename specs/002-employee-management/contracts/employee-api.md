# Contract: Employee API (`/employees`, `/departments`, `/designations`)

Per constitution Technology Stack, the canonical machine-readable contract is the OpenAPI
document generated at runtime from each endpoint's `zod` schema, registered in
`apps/api/src/lib/openapi.ts` via `registry.registerPath(...)` from `modules/employee/routes.ts`,
matching the pattern already established by 001's `modules/auth/routes.ts`. This file is the
human-readable source `/speckit-tasks` and `/speckit-implement` build that registration from.

All request/response schemas extend `modules/employee/schema.ts`
(`CreateEmployeeRequestSchema`, `UpdateEmployeeRequestSchema`, `EmployeeSchema`,
`DepartmentSchema`, `DesignationSchema` already exist; new schemas needed are marked **NEW**).

Every error response uses the constitution's standard shape:
`{ error: { code, message, fields? } }`.

Every endpoint below requires `authenticate` (001); role requirements are per-endpoint.

---

## POST /employees

**Role required**: `ADMIN`, `HR` (FR-001).

**Request** (`CreateEmployeeRequestSchema`, exists — gains one **NEW** optional field):
```json
{
  "name": "string",
  "email": "user@example.com",
  "departmentId": "string",
  "designationId": "string",
  "managerId": "string | null (optional)",
  "dateOfJoining": "YYYY-MM-DD",
  "role": "ADMIN|HR|MANAGER|EMPLOYEE (optional, defaults to EMPLOYEE)"
}
```

**Response 201** (**NEW** `CreateEmployeeResponseSchema` — extends `EmployeeSchema`):
```json
{
  "id": "...", "employeeCode": "EMP-00001", "name": "...", "email": "...",
  "departmentId": "...", "designationId": "...", "managerId": null,
  "dateOfJoining": "2026-01-15", "status": "ACTIVE",
  "temporaryPassword": "string — shown once, never retrievable again"
}
```

**Errors**:
| Status | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing/invalid required field (FR-001, spec Acceptance Scenario 3) |
| 409 | `MANAGER_INVALID` | `managerId` is self, creates a cycle, or targets an offboarded employee (research.md R2, spec Edge Cases) |
| 409 | `EMAIL_TAKEN` | `email` already used by another employee in this org |

**Side effects**: generates `employeeCode` (research.md R1); creates linked `User` row with a
temporary password (research.md R4); writes `ActivityLog` (`action: "employee.created"`).

---

## GET /employees

**Role required**: any authenticated user (FR-005) — response scope varies by role.

**Query params**: `department`, `designation`, `status` (optional filters, FR-006 — filtered
within the bounds of what the caller's role can see).

**Response 200** (**NEW** `EmployeeListResponseSchema`): `EmployeeSchema[]`, scoped per
research.md R3:
- `ADMIN`/`HR`: all employees in the org.
- `MANAGER`: their own record + direct reports only.
- `EMPLOYEE`: their own record only (use `GET /employees/directory` for colleague search).

---

## GET /employees/directory **(NEW)**

**Role required**: any authenticated user (FR-005/FR-006, User Story 2 Acceptance Scenario 1).

**Query params**: `q` (name search, optional), `department`, `designation` (optional filters).

**Response 200** (**NEW** `DirectoryEntrySchema[]`): basic info only, every active employee
regardless of caller role — `{ id, name, departmentId, designationId }` (no `email`, no
`managerId`, no salary-adjacent fields — nothing beyond "name, department, title" per spec).

---

## GET /employees/:id

**Role required**: any authenticated user; service layer enforces scope (FR-005/FR-007 via
001's constitution Principle III pattern).

**Response 200** (`EmployeeSchema`): the full record.

**Errors**:
| Status | code | When |
|---|---|---|
| 403 | `FORBIDDEN` | Caller is an Employee requesting someone else's record, or a Manager requesting a non-direct-report's record |
| 404 | `NOT_FOUND` | `id` doesn't exist in caller's org |

---

## PATCH /employees/:id

**Role required**: `ADMIN`, `HR` (FR-003).

**Request** (`UpdateEmployeeRequestSchema`, exists — partial `CreateEmployeeRequestSchema`,
`status` excluded from this endpoint per data-model.md's note that offboarding is a dedicated
action, not a general field update):
```json
{ "departmentId": "string (optional)", "designationId": "string (optional)", "managerId": "string | null (optional)" }
```

**Response 200** (`EmployeeSchema`): the updated record.

**Errors**: same `MANAGER_INVALID` as POST /employees; 404 `NOT_FOUND`.

**Side effects**: writes `ActivityLog` (`action: "employee.updated"`, `before`/`after` diff,
FR-011). Per spec User Story 3 Acceptance Scenario 1, the previous manager's team view
(`GET /employees` as that manager) reflects the change on next fetch — no caching layer to
invalidate since Server Components re-fetch per request (constitution Principle V).

---

## POST /employees/:id/offboard **(NEW)**

**Role required**: `ADMIN`, `HR` (FR-007, spec User Story 3 Acceptance Scenario 3 — no hard
delete endpoint exists at all, only this).

**Request**: no body.

**Response 200**: `{ "id": "...", "status": "OFFBOARDED" }`.

**Side effects**: sets `Employee.status = OFFBOARDED`; calls 001's exported
`revokeAllSessionsForUser` for the linked `User` (research.md R5, FR-008); writes `ActivityLog`
(`action: "employee.offboarded"`, FR-011). Historical records elsewhere (attendance, payslips,
etc.) are untouched (SC-004).

**Errors**: 404 `NOT_FOUND`; 409 `ALREADY_OFFBOARDED` if already offboarded (idempotency guard,
avoids a duplicate audit-log entry for a no-op).

---

## GET /employees/me/team **(NEW)**

**Role required**: `MANAGER` (FR-010 — a Manager's own reporting-line view: their manager, their
direct reports).

**Response 200** (**NEW** `TeamViewResponseSchema`):
```json
{
  "manager": { "id": "...", "name": "...", "designationId": "..." } | null,
  "directReports": [ { "id": "...", "name": "...", "designationId": "..." } ]
}
```
Empty `directReports` array (not an error) when all direct reports have been reassigned
elsewhere (spec Edge Cases).

---

## GET /departments

**Role required**: any authenticated user (used to populate the create/edit form's dropdown and
directory filters).

**Response 200**: `DepartmentSchema[]`.

## POST /departments

**Role required**: `ADMIN`, `HR` (FR-009).

**Request**: `{ "name": "string" }`. **Response 201**: `DepartmentSchema`.

**Errors**: 409 `DEPARTMENT_EXISTS` if `name` already used in this org.

## GET /designations

**Role required**: any authenticated user.

**Response 200**: `DesignationSchema[]`.

## POST /designations

**Role required**: `ADMIN`, `HR` (FR-009).

**Request**: `{ "title": "string", "level": "number (optional)" }`. **Response 201**:
`DesignationSchema`.

**Errors**: 409 `DESIGNATION_EXISTS` if `title` already used in this org.

---

## Schema additions needed in `modules/employee/schema.ts`

New (not yet present):
- `role` field added to `CreateEmployeeRequestSchema` (optional, `RoleSchema` from 001, defaults
  server-side to `EMPLOYEE`).
- `CreateEmployeeResponseSchema` — `EmployeeSchema` extended with `temporaryPassword: string`.
- `EmployeeListResponseSchema` — `z.array(EmployeeSchema)`.
- `DirectoryEntrySchema` / `DirectoryResponseSchema` — `{ id, name, departmentId, designationId }[]`.
- `TeamViewResponseSchema` — as shown above.

Existing, unchanged: `EmployeeStatusSchema`, `CreateEmployeeRequestSchema` (base),
`UpdateEmployeeRequestSchema`, `EmployeeSchema`, `DepartmentSchema`, `DesignationSchema`.

## Middleware reuse (from 001, no change)

- `authenticate` — verifies the access token / refresh-cookie fallback, attaches `req.user`.
- `authorize(...roles: Role[])` — role-only gate; scope checks ("my team") stay in
  `modules/employee/service.ts` per constitution Principle III and 001's research.md R5 pattern.
