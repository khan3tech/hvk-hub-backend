# Quickstart: Validate Employee Onboarding

```bash
npm run dev && node scripts/e2e/run-all.mjs 007
```

1. HR creates an employee with a manager → a checklist with the standard tasks exists, all
   incomplete; the profile shows `onboardingStatus: IN_PROGRESS`.
2. HR adds a one-off task → it's on that hire's checklist only, owner HR.
3. The hire completes their EMPLOYEE task (attributed), cannot complete the HR task (403); the
   manager sees and completes the MANAGER task; completing again → 409.
4. HR reassigns a task to another employee, who can then complete it.
5. The overview lists the hire with "3 of N" and `stalled: true` (joining date passed); employees
   get 403.
6. Adding a template task leaves the existing checklist unchanged.
7. Completing everything removes the hire from the overview and the profile shows `COMPLETE`.
8. HR attaches a checklist to a legacy employee; a second attach → 409.
