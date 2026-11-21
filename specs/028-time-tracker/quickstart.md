# Quickstart: Time Tracker validation

**Prerequisites**: Postgres running (`docker compose up -d postgres`), `npx prisma migrate dev`, `npm run seed`, `npm run dev` (API on :4000). Seed users `admin@`, `hr@`, `manager@`, `employee@hvk.in` (employee reports to manager).

**Automated**: `node scripts/e2e/028-time-tracker.mjs` (or `node scripts/e2e/run-all.mjs`), and `npm test` for the unit rules.

## Scenarios (see [contracts/time-tracker-api.md](./contracts/time-tracker-api.md))
1. **Setup (US2)**: as `manager@`, create project `{name:"Website", code:"WEB", billable:true}`, add task "Design", add `employee@` as member. A second create with code `WEB` → 409 `PROJECT_CODE_TAKEN`. As `employee@`, POST `/projects` → 403.
2. **Manual entry (US1)**: as `employee@`, POST `/entries` 150 minutes today on "Design" → 201, `billable: true`. GET `/timesheets/week` → total 150, status `DRAFT`. Logging on a task of a project they're not in → 403 `NOT_A_MEMBER`. Adding 1300 more minutes the same day → 409 `DAILY_LIMIT_EXCEEDED`.
3. **Timer (US3)**: POST `/timer/start` → 201; second start → 409 `TIMER_ALREADY_RUNNING`; GET `/timer` shows it; POST `/timer/stop` → entry with `source: "TIMER"`. Start, then DELETE `/timer` → no entry.
4. **Submit & approve (US4)**: with a timer running, submit → 409 `TIMER_RUNNING`; stop it, submit → `SUBMITTED`, manager gets `TIMESHEET_SUBMITTED`. Employee POST `/entries` in that week → 409 `WEEK_LOCKED`. `hr@` approves someone they don't manage → allowed; `manager@` approves own timesheet → 403. Reject without reason → 400; with reason → `REJECTED`, week editable, employee notified. Resubmit → approve → `APPROVED`. HR reopen → `DRAFT`.
5. **Team & reports (US5/6)**: `manager@` GET `/timesheets/team` lists `employee@` with status and total. GET `/reports/hours?groupBy=project` → WEB row total equals sum of entries; as `employee@` only own rows.
6. **Flagging**: unit test: a timer started 23:30 and stopped 00:30 org time, or running 12h01m, produces `flagged: true`.
