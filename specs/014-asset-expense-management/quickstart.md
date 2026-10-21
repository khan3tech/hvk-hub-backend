# Quickstart: Validate Asset & Expense Management

```bash
npm run dev && node scripts/e2e/run-all.mjs 014
```

1. HR adds two assets; a duplicate identifier → 409.
2. A new hire's checklist has an open asset task. Assigning the laptop marks it ASSIGNED and
   completes that task. Assigning it again to someone else → 409. The hire's profile lists both
   assets.
3. The hire resigns and HR acknowledges. Ticking the exit asset task by hand → 409 while assets
   are out. After one return the task stays open; marking the other LOST completes it. The
   returned laptop is UNASSIGNED with its history, and the lost monitor can't be assigned.
4. An employee's Travel claim without a receipt → 400. With a PDF it's PENDING and in their
   manager's queue. The manager can read the receipt; an unrelated employee can't. The manager
   approves, it shows in payouts, and HR marks it paid so it leaves the outstanding total.
5. A rejection needs a reason, which the employee sees.
6. Moving the employee to a new manager moves their pending claim to that manager's queue.
