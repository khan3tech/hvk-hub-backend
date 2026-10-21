# Quickstart: Validate the Org Chart

```bash
npm run dev && node scripts/e2e/run-all.mjs 016
```

The test provisions a fresh org (CEO → HR, Manager → 2 developers, plus one stray employee) and
designates the CEO as the top.

1. The chart is rooted at the CEO with 6 people. At depth 1 the manager shows 2 reports, loaded
   lazily. A developer's `myPath` is CEO → Manager → self.
2. Expanding the manager returns two leaves. A developer doesn't see a peer's email or HR flags;
   the manager sees their report's email.
3. Searching "devo" returns the developer with its path; "zzzz" returns `[]`.
4. HR sees the stray flagged as an orphan (the CEO isn't). Gaps list the stray and the headless
   department; assigning a head clears it. Employees get 403 on gaps.
5. Offboarding the manager removes them from the chart, and their reports become orphans
   (reason MANAGER_OFFBOARDED_OR_MISSING). The department is flagged HEAD_OFFBOARDED.
6. Cycle handling and the 5,000-person size bound are covered by `orgchart/service.test.ts`
   (cycles can't be created through the API).
