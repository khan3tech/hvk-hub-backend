# Quickstart: Validate Notifications

```bash
npm run dev && node scripts/e2e/run-all.mjs 006
```

1. A new hire with a manager files leave → the manager has a `LEAVE_PENDING_APPROVAL` item.
2. The manager rejects it with a reason → the requester has an unread `LEAVE_DECIDED` item that
   includes the reason (and an email line in the API log: `email (log sender, not delivered)`).
3. Unread count goes up; marking read lowers it; marking another user's id → 404; read-all → 0.
4. HR runs payroll → HR has a `PAYROLL_RUN_COMPLETED` summary with the payslip count and skipped list.
5. HR schedules an interview → the interviewer gets `INTERVIEW_SCHEDULED` with candidate and time;
   recording the result notifies HR/Admin and the posting department's Manager.
6. Email failure and offboarded-recipient behavior are covered by `notifications/service.test.ts`.
