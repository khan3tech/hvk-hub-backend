# Quickstart: Validate Engagement Surveys

```bash
npm run dev && node scripts/e2e/run-all.mjs 018
```

1. HR sends a survey to a new 5-person department. A survey without an eNPS question → 400.
   Members see it pending; an outsider doesn't and gets 404 on submit. A later joiner never
   sees it.
2. Four members respond, and one tries twice → 409. At 4 of 5 responses even Admin sees
   "withheld". The fifth response unlocks aggregates: scores 10, 9, 8, 6, 3 → eNPS 0 and a 100%
   response rate, with shuffled texts.
3. The database check confirms response rows have no person column, random UUIDs and day-only
   timestamps.
4. After closing, the trend shows the survey CLOSED with its eNPS and response rate. Closed
   surveys take no responses, and employees can't see the trend.
