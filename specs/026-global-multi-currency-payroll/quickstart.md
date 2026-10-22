# Quickstart: Validate Global / Multi-Currency Payroll

```bash
npm run dev && node scripts/e2e/run-all.mjs 026
```

The script provisions its own organization, so the seeded one stays single-country.

1. With nothing configured, payroll runs as before (an INR payslip, no country).
2. Assign US/USD and GB/GBP to two employees, and add a home-country component and a US
   component. A run skips unassigned employees (`NO_PAYROLL_COUNTRY`) and GB
   (`NO_STATUTORY_COMPONENTS_FOR_COUNTRY`).
3. Set home IN/INR and reporting USD. One run pays IN employees in INR with only the home
   component, and the US employee in USD with only the US component. The summary is grouped by
   country.
4. A transfer dated in the future leaves today's context and past payslips alone. Once it takes
   effect, the old-currency salary is skipped as `CURRENCY_MISMATCH`.
5. The reporting total first reports the missing INR rate. After recording a rate it matches
   manual conversion. Correcting the rate changes only the total, and re-running the period
   updates it.
