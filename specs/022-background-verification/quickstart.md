# Quickstart: Validate Background Verification

```bash
npm run dev && node scripts/e2e/run-all.mjs 022
```

1. An application at OFFER can't be hired without a check (409). HR starts a check with two
   items (PENDING); a second check → 409. The Manager sees only the status, the outcome is
   HR-only, and the Manager gets 403 on check detail.
2. One CLEARED result → IN_PROGRESS; re-recording → 409. The second item UNABLE_TO_VERIFY →
   COMPLETE with outcome CLEARED and `hasUnverified`. Adding an item reopens it; clearing it lets
   HR hire with no justification.
3. For a second candidate, a FLAGGED item shows on the application. Hiring needs a
   justification; a Manager can't override. HR hires with a justification, and the
   FLAGGED_CHECK override plus the notes are on record.
4. For a third, a flagged candidate is rejected and the check stays as context.
