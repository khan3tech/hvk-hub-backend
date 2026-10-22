# Quickstart: Validate Succession Planning

```bash
npm run dev && node scripts/e2e/run-all.mjs 024
```

1. A Manager can't mark a position critical, but HR can. HR sees the flag on the profile and the
   org chart; the holder and other employees don't.
2. HR adds two successors with readiness levels; a non-employee is refused. Raising one to
   READY_NOW adds a history entry and lowers the plan's risk.
3. With three critical positions (no successor, not ready, ready now), the overview groups them
   by risk and lists the successor covering two positions. The department filter narrows it, and
   Managers and employees get 403.
4. Offboarding a successor marks them invalid on both plans and recomputes risk. Offboarding a
   holder keeps their plan, flagged vacant. Unmarking removes a position from the overview but
   keeps its plan.
