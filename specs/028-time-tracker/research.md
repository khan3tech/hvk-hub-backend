# Research: Time Tracker

- **R1 — Calendar dates and time zone (spec Assumptions, edge "time zones")**
  - Decision: one constant, `ORG_TIME_ZONE = "Asia/Kolkata"`, decides an entry's or timer's calendar date. Dates are stored as `@db.Date`.
  - Rationale: there's no per-org time zone setting yet, and every current tenant is in India (INR default). A constant is easy to swap for a setting later.
  - Alternatives: the client sends its own time zone, rejected because it lets a user shift entries between locked weeks; or a new org setting, deferred.

- **R2 — Week identity (FR-012)**
  - Decision: a week is keyed by `weekStart`, the Monday of the week (ISO). `Timesheet` is unique on `(employeeId, weekStart)` and is created lazily on the first entry, or on submit. A week with no row reads as `NOT_STARTED`.

- **R3 — Denormalization (FR-018)**
  - Decision: `TimeEntry` stores `projectId` and `weekStart` next to `taskId` and `date`, so week lookups and reports are single-table queries.
  - Rationale: a task never moves between projects, and `weekStart` is a pure function of `date`.

- **R4 — One running timer (FR-007/008/010)**
  - Decision: a `RunningTimer` row per employee, with a unique `employeeId`.
    - Start inserts it; a P2002 conflict means `TIMER_ALREADY_RUNNING`.
    - Stop deletes the row and creates a `TimeEntry` in one transaction.
    - Switch does stop + start in one transaction.
  - Rationale: a server-side row survives reloads and is visible across devices; the unique constraint closes the double-start race.

- **R5 — Flagging (FR-011, SC-006)**
  - Decision: `flagged = true` when the org-local date at stop differs from the date at start, or the elapsed time is over 720 minutes.
  - The entry is dated on the start date, and elapsed seconds are rounded to the nearest minute, with a minimum of 1.

- **R6 — Locking (FR-013)**
  - Decision: every entry create, update or delete and every timer start loads the timesheet for the target `weekStart` (both old and new week for a move). It refuses with 409 `WEEK_LOCKED` when the status is SUBMITTED or APPROVED.
  - Submit is refused with 409 `TIMER_RUNNING` while the employee's timer start date falls in that week.

- **R7 — Approver (FR-014/015)**
  - Decision: the actor may decide a timesheet if they're HR/Admin, or the employee's `managerId` is the actor's `employeeId`. Nobody decides their own timesheet, including HR.
  - Reopen (APPROVED → DRAFT) is HR/Admin only.
  - Transitions are conditional `updateMany` calls on the expected current status, so two concurrent decisions can't both win.

- **R8 — Reports (FR-018/019)**
  - Decision: `prisma.timeEntry.groupBy` over the date range by `projectId`, `employeeId` or `taskId`, summing minutes split by `billable`. Names are joined in after the group-by.
  - Scope is applied as an `employeeId IN (...)` filter: self for an Employee; self plus direct reports for a Manager; all for HR/Admin.
  - `approvedOnly` limits to weeks whose timesheet is APPROVED.

- **R9 — Notifications (FR-016)**
  - Submit → the manager (`notifyEmployees`), or HR/Admin roles when there's no manager.
  - Approve, reject or reopen → the employee.
  - New types: `TIMESHEET_SUBMITTED` and `TIMESHEET_DECIDED`.
