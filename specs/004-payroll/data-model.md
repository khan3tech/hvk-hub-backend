# Phase 1 Data Model: Payroll

`SalaryStructure` and `Payslip` already exist in `apps/api/prisma/schema.prisma` (added up front
per constitution Principle VI). This feature adds no new models and no migration — it documents
how the existing models are read/written by this feature's service layer, plus one small
cross-module addition to 002 and 003's service APIs (research.md R2, R4).

## SalaryStructure (existing model, used not modified)

| Field | Type | Used by this feature as |
|---|---|---|
| `id` | `String @id` | Primary key. |
| `orgId` | `String` | Every query scopes by this (Principle VI). |
| `employeeId` | `String` | FK to `Employee` (002's model, not owned here). |
| `basic` | `Float` | The base amount (FR-001). |
| `hra` | `Float` | Standard component (spec's "small set of standard components" — housing allowance is the canonical one already modeled). |
| `allowances` | `Json` | Additional named components as a flat `{ name: amount }` map (FR-001 "a small set of standard components" beyond basic/hra). |
| `effectiveFrom` | `DateTime @db.Date` | Versioning key (research.md R1) — the structure "in effect" for a period is the latest row with `effectiveFrom <=` that period's end date. |
| `currency` | `String?` | Out of this feature's scope (026's concern) — read as null/org-default, never set here. |

**Validation rules** (enforced in `modules/payroll/service.ts`):
- `basic >= 0`, `hra >= 0`, every value in `allowances` `>= 0` (FR-001).
- Rows are never updated or deleted by this feature — "editing" a structure always inserts a new
  row with a later `effectiveFrom` (research.md R1, FR-002's "prior structures remain on
  record").
- Only `ADMIN`/`HR` may create a row (FR-001, spec Acceptance Scenario 3).

**Lookup rule** (`findEffectiveSalaryStructure`, research.md R1):
```
SELECT * FROM SalaryStructure
WHERE orgId = :orgId AND employeeId = :employeeId AND effectiveFrom <= :periodEndDate
ORDER BY effectiveFrom DESC
LIMIT 1
```
Returns `null` if the employee has no structure with an `effectiveFrom` on or before the period
— this is the "skip and report" case (FR-011, research.md R5).

## Payslip (existing model, used not modified)

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | Primary key. |
| `orgId` | `String` | Scope. |
| `employeeId` | `String` | FK to `Employee`. |
| `periodMonth` | `Int` | 1-12. |
| `periodYear` | `Int` | E.g. 2026. |
| `earnings` | `Json` | `{ basic, hra, ...allowances }` after proration (research.md R3), before the unpaid-leave deduction is applied — kept separate from `deductions` so the breakdown (FR-005 "clear breakdown of earnings and deductions") is legible, not pre-netted. |
| `deductions` | `Json` | `{ unpaidLeave: amount }` — the unpaid-leave deduction (research.md R2) expressed in the structure's currency; no statutory tax deduction exists yet (out of scope, spec Assumptions — 010's future concern). |
| `netPay` | `Float` | `sum(earnings) - sum(deductions)`. |
| `generatedAt` | `DateTime @default(now())` | Set (re-set on re-run) at computation time. |
| `currency` | `String?` | Copied from the `SalaryStructure` used, or org default; immutable once generated per schema's own comment even if the employee's currency assignment later changes (026's concern, not modified here). |

**Validation rules**:
- `@@unique([employeeId, periodMonth, periodYear])` (existing schema constraint) is what makes
  FR-006/SC-005 a database-level guarantee — see research.md R5's `upsert` strategy.
- No endpoint in this feature's contract allows a direct field-level edit to an existing
  `Payslip` row (FR-007) — the only way its `earnings`/`deductions`/`netPay` change is a full
  `runPayroll` call for that same period, which `upsert`s the whole row.
- `earnings`/`deductions` are `Json` (matching the existing schema, not row-per-component) — this
  feature's service layer is the only place that knows their internal shape; no separate
  `PayslipLineItem` table exists or is needed for v0.1's "small set of standard components."

**Lifecycle**: created on first `runPayroll` for a period; replaced (same row, via `upsert`) on
every subsequent run for that period; never deleted, never edited outside a run — matches
constitution Principle IV's own named example for this feature exactly.

## Cross-module additions (research.md R2, R4)

Not new models — new exported functions on modules 002 and 003 already own:

- **`apps/api/src/modules/attendance/service.ts`** gains
  `getUnpaidLeaveDaysForPeriod(orgId, employeeId, periodStart, periodEnd): Promise<number>` —
  approved, unpaid-leave-type working days overlapping the period, reusing 003's existing
  working-day counting logic (research.md R2).
- **`apps/api/src/modules/employee/service.ts`** gains
  `getOffboardedDate(orgId, employeeId): Promise<Date | null>` — reads the `ActivityLog` row
  written by `offboardEmployee` (`action: "employee.offboarded"`), returning its `createdAt`, or
  `null` if the employee was never offboarded (research.md R4).

Both are read-only additions to each module's own service layer — no schema change, no new
table, and 004 calls them rather than querying `LeaveRequest`/`ActivityLog` directly (Principle
I).

## ActivityLog (existing model, new usage by this feature)

No schema change. This feature writes:
- `action: "payroll.run"` — `entity: "PayrollRun"` (a conceptual entity, not a table — no
  dedicated `PayrollRun` model exists or is needed; the run itself is represented by the set of
  `Payslip` rows it produced/replaced), `entityId`: a synthetic id like `"{periodYear}-
  {periodMonth}"`, `after: { periodMonth, periodYear, payslipCount, skipped: [...] }` — one row
  per run (not per payslip), in the same transaction as the `Payslip` upserts, per constitution
  Principle IV's explicit callout that payroll runs are an irreversible business event requiring
  this.
- `action: "salary_structure.set"` — `entity: "SalaryStructure"`, on every new version created
  (FR-001/FR-002's audit trail, consistent with 002's own `employee.updated` pattern).

`actorId` is the calling HR/Admin's `employeeId` — same pattern and same known gap (an HR/Admin
`User` with no linked `Employee`) already flagged in 001/002's data-model.md, not re-solved here.
