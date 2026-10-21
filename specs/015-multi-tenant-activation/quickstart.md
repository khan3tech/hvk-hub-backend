# Quickstart: Validate Multi-Tenancy

```bash
npx prisma migrate deploy && npm run seed && npm run dev
node scripts/e2e/run-all.mjs 015
```

1. Records are created in org A (default) across every module.
2. The operator signs in at `/api/platform/auth/login` (`platform@teamloom.dev`). Org tokens get
   401 on `/api/platform` and the platform token gets 401 on org APIs.
3. The operator provisions org B, and B's Admin signs in at once. Org A's employee count is
   unchanged apart from the test's own hire.
4. From org B, every list excludes A's records and every direct lookup or action on an A ID is
   refused. This covers employees, directory, lookups, leave, payroll, recruitment, documents,
   policies, exit, statutory, assets, expenses, performance, onboarding, notifications and
   analytics. Writes that reference A's department, employee or candidate IDs fail.
5. Org B can create its own "Engineering" department, and its payroll run only touches its own
   employees.
6. An email present in both orgs needs `organization`, and each slug signs into its own org.
7. The operator sees both orgs with usage. Suspending B returns 403 for its live token and its
   sign-in while A keeps working; reactivating restores access at once.
