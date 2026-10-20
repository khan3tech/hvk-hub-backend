# Contract: Payroll API (`/payroll/*`)

Per constitution Technology Stack, the canonical machine-readable contract is the OpenAPI
document generated at runtime from each endpoint's `zod` schema, registered in
`apps/api/src/lib/openapi.ts` via `registry.registerPath(..., tags: ["Payroll"])`, matching
001/002/003's pattern — one shared registry, grouped into a heading per module by tag.

All request/response schemas extend `modules/payroll/schema.ts` (`SalaryStructureSchema`,
`SetSalaryStructureRequestSchema`, `RunPayrollRequestSchema`, `PayslipSchema` already exist; new
schemas needed are marked **NEW**).

Every error response uses the constitution's standard shape:
`{ error: { code, message, fields? } }`. Every endpoint requires `authenticate` (001); role
requirements are per-endpoint.

---

## POST /payroll/salary-structures/:employeeId

**Role required**: `ADMIN`, `HR` (FR-001, spec Acceptance Scenario 3).

**Request** (`SetSalaryStructureRequestSchema`, exists):
```json
{ "basic": 50000, "hra": 10000, "allowances": { "transport": 2000 }, "effectiveFrom": "YYYY-MM-DD" }
```

**Response 201** (`SalaryStructureSchema`, exists): the newly created version.

**Errors**: 400 `VALIDATION_ERROR` (negative amounts); 404 `NOT_FOUND` (no such employee in org).

**Side effects**: inserts a new row — never updates or deletes a prior version (research.md R1,
FR-002); writes `ActivityLog` (`action: "salary_structure.set"`).

---

## GET /payroll/salary-structures/:employeeId

**Role required**: `ADMIN`, `HR` (any employee), or the employee themself (own only) — mirrors
FR-001/FR-010's viewing rule (spec Acceptance Scenario 3: "viewing is refused unless it is their
own (Employee) or reserved for HR/Admin").

**Query params**: `asOf` (optional date, defaults to today) — returns the version in effect on
that date (research.md R1's lookup), not the full history.

**Response 200** (`SalaryStructureSchema`): the structure in effect. 404 `NOT_FOUND` if the
employee has none yet.

**Errors**: 403 `FORBIDDEN` if the caller is an Employee requesting someone else's, or a Manager
(Managers do not have salary-structure view access at all per spec — only payslip view-only,
FR-009).

---

## POST /payroll/runs

**Role required**: `ADMIN`, `HR` (FR-003).

**Request** (`RunPayrollRequestSchema`, exists):
```json
{ "periodMonth": 9, "periodYear": 2026 }
```

**Response 200** (**NEW** `RunPayrollResponseSchema`):
```json
{
  "periodMonth": 9, "periodYear": 2026,
  "payslipCount": 42,
  "skipped": [ { "employeeId": "...", "reason": "NO_SALARY_STRUCTURE" } ]
}
```

**Errors**: 400 `VALIDATION_ERROR` (invalid month/year).

**Side effects** (one transaction per constitution Principle IV): for every employee active for
any part of the period, computes a payslip (structure lookup, research.md R1; proration,
research.md R3; unpaid-leave deduction via 003's `getUnpaidLeaveDaysForPeriod`, research.md R2)
and `upsert`s the `Payslip` row keyed on `[employeeId, periodMonth, periodYear]` — a second run
for the same period replaces every row, never duplicates (FR-006, SC-005, research.md R5). Any
employee with no salary structure in effect is skipped and reported in `skipped`, not silently
omitted (FR-011). Writes one `ActivityLog` row for the run itself (`action: "payroll.run"`).

---

## GET /payroll/payslips/me

**Role required**: any authenticated user (FR-008).

**Response 200** (**NEW** `PayslipListResponseSchema` — `z.array(PayslipSchema)`): the caller's
own payslips, all periods, newest first.

## GET /payroll/payslips/me/:id

**Role required**: any authenticated user, own payslips only.

**Response 200** (`PayslipSchema`): full earnings/deductions/net-pay breakdown (FR-005, spec
Acceptance Scenario 2 — "a clear breakdown... and can obtain a downloadable copy"; the downloadable
copy is this same JSON rendered as a printable page client-side — no separate PDF-generation
endpoint in v0.1 scope).

**Errors**: 403 `FORBIDDEN` if the `id` belongs to another employee's payslip (spec Acceptance
Scenario 3 — "attempt to reach another employee's payslip directly... refused"); 404 `NOT_FOUND`.

---

## GET /payroll/payslips/team

**Role required**: `MANAGER` (FR-009, view-only — no corresponding write endpoint exists at all).

**Query params**: `periodMonth`, `periodYear` (optional filters).

**Response 200** (`PayslipListResponseSchema`): payslips for the caller's current direct reports
only, resolved live via 002's `getTeamView` (research.md R6, same "no stale assignment" pattern
as 003's manager-approval-queue).

---

## GET /payroll/payslips

**Role required**: `ADMIN`, `HR` (FR-010 — anyone in the company).

**Query params**: `employeeId`, `periodMonth`, `periodYear` (all optional filters).

**Response 200** (`PayslipListResponseSchema`): all matching payslips org-wide.

---

## Schema additions needed in `modules/payroll/schema.ts`

New (not yet present):
- `RunPayrollResponseSchema` — `{ periodMonth: z.number(), periodYear: z.number(), payslipCount:
  z.number(), skipped: z.array(z.object({ employeeId: z.string(), reason: z.string() })) }`.
- `PayslipListResponseSchema` — `z.array(PayslipSchema)`.

Existing, unchanged: `SalaryStructureSchema`, `SetSalaryStructureRequestSchema`,
`RunPayrollRequestSchema`, `PayslipSchema`.

## Cross-module functions this contract depends on (not new endpoints)

- 002's `getEmployee`, `getTeamView` (existing, reused as-is).
- 002's new `getOffboardedDate(orgId, employeeId)` (research.md R4).
- 003's new `getUnpaidLeaveDaysForPeriod(orgId, employeeId, periodStart, periodEnd)` (research.md
  R2).

## Middleware reuse (from 001, no change)

- `authenticate` — verifies the access token / refresh-cookie fallback, attaches `req.user`.
- `authorize(...roles: Role[])` — role-only gate; "my direct reports" scoping for the Manager
  payslip view stays in `modules/payroll/service.ts`, calling 002's exported functions rather
  than querying `Employee` directly (constitution Principle I/III).
