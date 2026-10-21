# Quickstart: Validate Performance Management

```bash
npm run dev && node scripts/e2e/run-all.mjs 012
```

1. The employee proposes a goal. Another manager can't approve it. Their manager requests
   changes, the employee sees the note and revises, then the manager approves it (ACTIVE). The
   employee sets 60% progress and the manager sees it.
2. HR opens a cycle for the employee. The manager's to-do has the review, showing the goal at 60%.
   The employee adds self-reflection and the manager drafts a rating.
3. HR moves the employee to a second manager. The review leaves the first manager's to-do and
   appears in the second's with `previousManagerId`. The old manager can't edit it.
4. The new manager finalizes it. Both sides' edits → 409. HR corrects the rating with a reason.
   The cycle shows 1 completed.
5. A cycle that ended in the past shows its open review as overdue. Employees get 403 on cycles.
6. The employee's history lists the goal and the final review.
