# Phase 0 Research: Payroll

## R1: Salary structure versioning and "structure in effect" lookup

**Decision**: `SalaryStructure` rows are never updated or deleted — "updating" an employee's
structure (FR-001/FR-002) means inserting a new row with a later `effectiveFrom`. The structure
"in effect" for a given payroll period is the row with the latest `effectiveFrom <=` the last
day of that period, found per employee via `findEffectiveSalaryStructure(orgId, employeeId,
periodEndDate)` — `ORDER BY effectiveFrom DESC LIMIT 1` filtered to `effectiveFrom <=
periodEndDate`.

**Rationale**: FR-002 explicitly requires "past payroll periods remain explainable using the
structure that was in effect at the time" — an append-only history is the only way a later edit
can't silently rewrite what an already-generated payslip was computed from. This is the same
append-only pattern constitution Principle IV already mandates for `ActivityLog`, applied here to
`SalaryStructure` itself rather than a separate audit trail alongside it — no extra table needed
(Principle VII).

**Alternatives considered**: A single mutable `SalaryStructure` row per employee plus a separate
`SalaryStructureHistory` audit table — rejected as redundant; the existing schema already has no
row-level history table, and versioning via multiple rows (already how the schema is shaped —
`effectiveFrom` with no unique constraint forcing one-row-per-employee) achieves the same
explainability with one table, not two.

## R2: Unpaid-leave day count for a period (cross-module read)

**Decision**: Add one new exported function to 003's `apps/api/src/modules/attendance/service.ts`:
`getUnpaidLeaveDaysForPeriod(orgId, employeeId, periodStart, periodEnd)` — returns the count of
approved `LeaveRequest` working-days (reusing 003's existing `countWorkingDays`-style logic)
whose `LeaveType.isPaid === false` and whose range overlaps `[periodStart, periodEnd]`, clipped
to the period's own bounds. 004's payroll service calls this function; it never queries
`LeaveRequest`/`LeaveType`/`Attendance` tables directly (constitution Principle I).

**Rationale**: FR-004 requires payroll to reduce pay "proportionally for any unpaid leave days
recorded in that period" — 003 already owns the concept of a leave type being paid or unpaid
(`LeaveType.isPaid`, established in 003's own spec/schema) and already has the working-day
counting logic (003 research.md R1) that correctly excludes weekends/holidays from a date range.
Re-deriving that logic inside 004 would duplicate a subtle calculation (and risk it drifting out
of sync with 003's own balance math) instead of exposing it once from the module that owns the
concept.

**Alternatives considered**: 004 querying `LeaveRequest` directly via its own repository —
rejected, violates Principle I (a module must not reach into another module's tables) exactly
the way 001/002/003 already established the pattern of exposing a purpose-built function instead
(e.g. 001's `revokeAllSessionsForUser`, 002's `getTeamView`). Computing "unpaid days" as a raw
calendar-day count instead of working-days — rejected as inconsistent with 003's own balance
accounting, which already excludes weekends/holidays; payroll should charge the same day count
003 already established as meaningful, not a different one.

## R3: Proration formula (partial period: joining, offboarding, or both)

**Decision**: For an employee whose active status only covers part of the payroll period,
prorate their gross pay by `(active working days in period) / (total working days in period)`,
using 003's `countWorkingDays`-style logic (weekday-only, no holiday exclusion needed here since
proration is about *presence in the org*, not leave — see note below) applied to:
- **Joined mid-period**: active range is `[employee.dateOfJoining, periodEnd]` (clipped to the
  period).
- **Offboarded mid-period**: active range is `[periodStart, lastActiveDate]`, where
  `lastActiveDate` is read from the `ActivityLog` row written by 002's `offboardEmployee`
  (`action: "employee.offboarded"`, that row's `createdAt`) — see R4 for why this is the source,
  not a new `Employee` field.
- **Both** (joined and offboarded within the same period — a very short tenure): both bounds
  applied together.

The unpaid-leave deduction (R2) is applied *after* proration, against the prorated gross, not
double-counted against the full period.

**Rationale**: FR-012 requires proration for both join and offboard mid-period cases; spec Edge
Cases confirm both directions explicitly. A working-days ratio (not calendar-day ratio) keeps
the proration consistent with how 003 already treats weekends as non-working days elsewhere in
the system, and avoids a second, different notion of "day" appearing in payroll math. Holidays
are *not* excluded from the proration denominator/numerator here (unlike 003's leave-balance
counting) because proration is about how much of the period the person was actively employed,
not about leave-balance charging — an employee who joined before a company holiday still "was
employed" on that holiday even though no one works it; using calendar working-days (Mon-Fri)
without a holiday carve-out is the simplest defensible rule and is documented here explicitly so
it isn't silently inconsistent with 003 by accident.

**Alternatives considered**: Calendar-day (not working-day) proration ratio — rejected as it
would pay differently for an employee joining on a Friday vs. a Monday for the "same" number of
elapsed calendar days, which working-day proration avoids. Excluding holidays from the
proration ratio too (matching R2 exactly) — considered but rejected: a holiday is a non-working
day, not a non-employment day, so weekday-only Mon-Fri computation matches "how much of my
employment period does this fraction represent" better than a leave-charging computation would.

## R4: Determining "last active day" for offboarding proration

**Decision**: The offboarded employee's `lastActiveDate` for proration purposes is the `createdAt`
timestamp of their `ActivityLog` row with `action: "employee.offboarded"` (written by 002's
`offboardEmployee`, per 002's data-model.md), looked up via a new small exported function in
002's employee service: `getOffboardedDate(orgId, employeeId)`. If somehow no such row exists
(shouldn't happen given 002 always writes it in the same transaction as the status change, but
defensively), fall back to `Employee.updatedAt` as a best-effort approximation and proceed rather
than failing the whole payroll run for one employee.

**Rationale**: The `Employee` model (002's, per schema.prisma) has no dedicated
"offboarded-on" date field — only `status` and the generic `updatedAt`. Adding one would be a
schema change to a table 004 doesn't own (Principle I violation to do unilaterally) for a value
002 already effectively records via its audit log. Reusing the existing `ActivityLog` row avoids
a redundant field that could drift out of sync with the audit trail's own timestamp.

**Alternatives considered**: Adding an `offboardedAt` column to `Employee` — rejected; would
require a 002 schema change initiated from within 004's planning, which isn't this feature's
tables to modify unilaterally, and the audit log already has the answer. Using `updatedAt` as the
primary source — rejected as primary because `updatedAt` changes on *any* employee field update,
not just offboarding, making it an unreliable signal on its own; it's kept only as the narrow
defensive fallback described above.

## R5: Payroll run — replace-not-duplicate semantics and skipped-employee reporting

**Decision**: `runPayroll(orgId, periodMonth, periodYear, actor)` iterates every `Employee` with
`status = ACTIVE` in the org (plus anyone who was `ACTIVE` for at least part of the period but is
now `OFFBOARDED`, identified via R4's offboard-date falling inside the period), computes each
one's payslip (R1 structure lookup, R2 unpaid-leave deduction, R3 proration), and calls
`prisma.payslip.upsert` keyed on the schema's existing `@@unique([employeeId, periodMonth,
periodYear])` — so a second run for the same period naturally replaces each employee's row via
the database constraint itself, not application-level "find and delete first" logic. Any
employee with no `SalaryStructure` row at all (R1's lookup returns nothing) is skipped and
collected into a `skipped: [{ employeeId, reason: "NO_SALARY_STRUCTURE" }]` array returned
alongside the run's payslip count — never silently omitted (FR-011).

**Rationale**: FR-006's "replace, not duplicate" and SC-005's "never more than one payslip per
employee per period" are already guaranteed at the schema level by the existing unique
constraint — `upsert` is the natural way to use that guarantee instead of re-deriving it in
service-layer logic (Principle VII: don't build what the database already enforces). FR-011
requires skipped employees to be clearly reported, not silently dropped, so the run's response
shape must carry that list explicitly rather than just a payslip count.

**Alternatives considered**: `deleteMany` for the period followed by `createMany` — rejected;
loses the specific "this row was replaced, not newly created" distinction an `upsert` preserves
for free, and briefly leaves a window with no payslip row if the process were interrupted between
delete and create (upsert has no such window per row). Failing the entire run if any employee
lacks a salary structure — rejected; FR-011's "skip and report" wording is explicit that a single
missing structure must not block payroll for everyone else.

## R6: Payslip scoping (Employee / Manager / HR-Admin)

**Decision**: Mirrors 002's `getEmployee`/`listEmployeesForRequester` scoping pattern exactly:
`ADMIN`/`HR` can list/view any payslip in the org; `MANAGER` can view (never edit — there is no
edit endpoint at all, per FR-007) their current direct reports' payslips, resolved live via 002's
`getTeamView` (same "no stale assignment" reasoning as 003's research.md R5); `EMPLOYEE` can view
only their own.

**Rationale**: FR-008/FR-009/FR-010 describe exactly this three-tier scope, and 002/003 already
established the pattern (service-layer scoping calling into 002's reporting-line functions,
never route-level only) — reusing it keeps payroll consistent with the rest of the system rather
than inventing a fourth scoping shape.

**Alternatives considered**: None seriously considered — this is a direct application of the
already-established cross-module pattern, not a novel design point.
