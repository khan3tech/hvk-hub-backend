# Tasks: Employee Referral Program

**Input**: plan.md, contracts/referrals-api.md, quickstart.md. Backend only.

- [X] T001 Migrations `referral_program` (enum) + `referral_program_columns`
- [X] T002 Hooks: recruitment stage-change, payroll one-off earnings, candidate-deletion cleanup
- [X] T003 US1: submit via shared applyCandidate (REFERRAL), resume, self-referral guard; my referrals (FR-001–003)
- [X] T004 US2: config with terms snapshot; hired/rejected transitions; qualifying evaluation with email match / HR link; forfeit (FR-004–007/010)
- [X] T005 US3: schedule payout; payslip line; paid once; re-run safe (FR-008/009)
- [X] T006 Unit tests (10 referrals + 1 payroll); `scripts/e2e/021-referrals.mjs` (18 checks)
