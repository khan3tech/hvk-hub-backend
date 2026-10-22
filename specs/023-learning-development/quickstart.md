# Quickstart: Validate Learning & Development

```bash
npm run dev && node scripts/e2e/run-all.mjs 023
```

1. HR creates a course and assigns it to a department with a due date. Each member sees it
   INCOMPLETE with the due date. Someone hired later doesn't get it.
2. An employee completes it, and HR's tracking shows the completion. For a proof-required
   course past its due date, the assignee sees OVERDUE. Completing without a file → 400; with a
   PDF it completes and the file appears in their documents.
3. A compliance course is assigned to the department. A new hire is enrolled automatically. The
   dashboard shows completed vs outstanding, with overdue people flagged. Offboarding someone
   drops them from the counts while their history stays.
4. Reassigning a completed course creates a new cycle. Archiving blocks new assignments and
   keeps the records.
