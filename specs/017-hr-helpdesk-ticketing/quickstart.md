# Quickstart: Validate the HR Helpdesk

```bash
npm run dev && node scripts/e2e/run-all.mjs 017
```

1. An employee sees the default categories and raises a Payroll ticket: it's OPEN, unassigned
   and in HR's queue. A manager can't see it (404) or the queue (403).
2. HR can't assign it to a non-HR employee. HR assigns it to themselves (ASSIGNED) and replies;
   the employee sees the reply and gets a notification.
3. HR resolves it and it leaves the active queue. HR can't reopen it, but the employee can.
4. The summary shows resolved counts and the average resolution time. HR changes the overdue
   threshold.
5. Overdue-clock rules are covered by `helpdesk/service.test.ts`.
