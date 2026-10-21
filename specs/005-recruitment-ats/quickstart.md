# Quickstart: Validate Recruitment / ATS

```bash
npx prisma migrate deploy && npm run seed && npm run dev
node scripts/e2e/run-all.mjs 005      # automated API-side run of every scenario below
```

1. **Postings (US1)**: HR creates a posting → OPEN. Manager's create → 403. Employee sees open postings.
2. **Candidates & applications (US2)**: HR adds a candidate (searchable), applies them → APPLIED;
   applying again → 409 `DUPLICATE_APPLICATION`; a second posting gets its own application.
3. **Pipeline (US3)**: the posting department's Manager moves APPLIED → SCREEN; a Manager of another
   department is refused (403) and can't see that pipeline; HIRED shows `isTerminal: true` and the
   Manager can no longer move it (409); HR can still correct it.
4. **Interviews (US4)**: HR schedules a round (INTERVIEW stage only); the interviewer sees it under
   `/interviews/me`; another employee's result → 403; the interviewer records PASS + feedback; the
   Manager sees all rounds on the application.
5. **Edge cases**: closing a posting keeps its applications visible but refuses new ones (409
   `POSTING_NOT_OPEN`); moving backward is allowed for HR and audited.
