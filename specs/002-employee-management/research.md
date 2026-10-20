# Phase 0 Research: Employee Management

## R1: Employee code format and generation

**Decision**: `EMP-{orgId-independent sequential number, zero-padded to 5 digits}`, e.g.
`EMP-00001`. Generated in `service.ts` at creation time by counting existing `Employee` rows for
the org (`prisma.employee.count({ where: { orgId } })`) and formatting `count + 1`, inside the
same transaction as the `Employee` create so two concurrent creates can't race to the same code
(guarded by the existing `@@unique([orgId, employeeCode])` constraint as a backstop — a
collision throws and the caller retries once).

**Rationale**: FR-002 requires a "unique, human-readable" code. A sequential, human-readable
format is simplest to generate and read (no external ID service, no UUID-in-disguise), and the
existing unique constraint on `[orgId, employeeCode]` already guarantees correctness even under
a rare race — no need for a separate counter table or advisory lock (Principle VII: don't add
infrastructure for a collision that's already prevented by a DB constraint, just handle the
retry).

**Alternatives considered**: A separate `Counter` table per org for atomic increment — rejected
as unnecessary; the unique-constraint-plus-retry approach handles the same race with no new
schema. UUID/cuid as the "code" — rejected, not human-readable, defeats the point of FR-002
having a code distinct from `id`.

## R2: Manager assignment validation (self-reference and cycles)

**Decision**: On create or update, before writing `managerId`, walk up the candidate manager's
own `managerId` chain (bounded loop, max depth = org's total employee count as a safety cap) and
reject if the *target* employee's own id appears in that chain — this catches both direct
self-reference (FR-004, spec Edge Cases) and transitive cycles (A manages B manages C manages A).
Also reject if the candidate manager's `status = OFFBOARDED` (spec Edge Cases) unless the caller
explicitly confirms a replacement is being assigned in the same request (out of scope for v0.1 —
just reject, per spec's "or warn and require a replacement" being resolved to the simpler
"reject" branch, consistent with FR-004's MUST-reject wording for the self-reference case).

**Rationale**: FR-004 only mandates rejecting direct self-reference, but the spec's Edge Cases
section frames it as a "self-reference loop," and a transitive cycle (A→B→C→A) is the same class
of data-integrity bug with a worse blast radius (an infinite loop in any future org-chart
traversal, e.g. 016's org-chart visualization). Walking the chain at write-time is a cheap
service-layer check (bounded by org size, which is small for v0.1) and is the only place that
can see the full reporting-line graph — consistent with constitution Principle III's stance that
this kind of relationship check belongs in the service layer, not route middleware.

**Alternatives considered**: A DB-level check constraint or trigger — rejected; Postgres can't
express a recursive-cycle check declaratively without a trigger function, which is more moving
parts than a bounded loop in TypeScript for a per-org employee count that's small at this scale
(Principle VII).

## R3: Directory scope enforcement (Employee/Manager/HR-Admin)

**Decision**: A single `listEmployees(orgId, requester)` service function branches on
`requester.role`: `ADMIN`/`HR` get an unfiltered org query; `MANAGER` gets
`where: { managerId: requester.employeeId }` (their direct reports) plus their own record;
`EMPLOYEE` gets only their own record via `getEmployeeById`, with the *general directory search*
(FR-006 — search colleagues by name/department/title) implemented as a separate, narrower
`searchDirectory(orgId, query)` that returns only `{ name, department, designation }` for every
active employee regardless of caller role — satisfying User Story 2 Acceptance Scenario 1
("search basic info... but not restricted fields") without a role branch on the *search* path
itself, since basic info is visible to everyone by design.

**Rationale**: Matches spec FR-005/FR-006 and constitution Principle III's requirement that
scope checks live in the service layer. Two functions (full-record list vs. basic-info search)
rather than one function returning field-filtered results based on role avoids a single
overloaded function silently changing its response *shape* per caller — each API consumer (the
directory search box vs. a Manager's team view) gets a distinctly-typed, predictable response.

**Alternatives considered**: One `getDirectory(role)` function returning role-conditional field
subsets of the same shape — rejected as harder to reason about and test (the response type
would vary at runtime based on role, which `zod` response validation can't express as cleanly as
two distinct schemas).

## R4: Linked User provisioning on employee creation

**Decision**: Creating an `Employee` also creates its linked `User` row in the same Prisma
transaction, with role defaulting to `EMPLOYEE` unless HR/Admin explicitly specifies a different
role in the create request (`CreateEmployeeRequestSchema` gains an optional `role` field,
defaulting server-side to `EMPLOYEE`), and a system-generated temporary password (random,
bcrypt-hashed, cost 12 per constitution Principle III) that is returned once in the create
response for HR to communicate out-of-band.

**Rationale**: Spec Assumptions state "a separate invite email flow is out of scope for v0.1" —
so the temporary password must reach HR through the API response itself (there's no email
delivery in scope, per constitution's explicitly-out-of-scope list too). Returning it once,
never storing or logging the plaintext, and requiring the standard 001 login flow thereafter
keeps this feature from silently depending on 006 (Notifications, not yet built).

**Alternatives considered**: Deferring `User` creation to a separate manual step — rejected;
spec Assumptions explicitly say the linked login account "is provisioned automatically when the
employee record is created," so this is not an open question, just an implementation detail of
how the initial credential reaches HR without an email system.

## R5: Offboarding cascade

**Decision**: `offboardEmployee(orgId, employeeId)` sets `Employee.status = OFFBOARDED` and, in
the same service call, invokes 001's exported `revokeAllSessionsForUser(userId)` (already built
and exported specifically for this purpose — see 001's tasks.md T035) to immediately end any
active session, satisfying FR-008 and 001's FR-010. No other cascade (attendance/payroll/leave
history) is touched — spec User Story 3 and SC-004 explicitly require historical records to
remain untouched.

**Rationale**: 001 already built and exported exactly this hook anticipating this feature; using
it (rather than re-deriving revocation logic here) avoids duplicating auth's `RefreshToken`
revocation logic in a second module (Principle I: auth module owns its own tables).

**Alternatives considered**: Having this module directly update `RefreshToken` rows — rejected,
violates Principle I (a module must not reach into another module's tables; it calls that
module's service).
