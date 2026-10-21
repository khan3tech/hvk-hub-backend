# Quickstart: Validate Resignation & Exit

```bash
npm run dev && node scripts/e2e/run-all.mjs 009
```

1. A manager with one direct report resigns → PENDING; a second submission → 409; their manager
   (not another manager) sees it and is notified.
2. Another manager's acknowledge → 403; their manager acknowledges with a later date →
   SERVING_NOTICE with both dates; the profile shows `exitStatus: SERVING_NOTICE`.
3. The checklist has IT/FINANCE/HR tasks and flags the direct report for reassignment.
4. HR records exit-interview notes (hidden from the employee).
5. Offboard → 409 listing remaining tasks; after completing all, offboard → COMPLETED; the
   employee can no longer sign in and their old token is rejected; history stays readable.
6. Another employee resigns, is acknowledged, then withdrawn: ACTIVE, `exitStatus: null`,
   checklist closed, still signed in.
7. A forced offboard succeeds with tasks still open and visible.
8. The "last day passed" HR prompt is covered by `exit/service.test.ts` (hourly job in the server).
