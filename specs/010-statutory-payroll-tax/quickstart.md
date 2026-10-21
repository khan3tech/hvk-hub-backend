# Quickstart: Validate Statutory Payroll Tax

```bash
npm run dev && node scripts/e2e/run-all.mjs 010
```

With two employees on basic 50,000 / HRA 20,000 / special 10,000 (gross 80,000):

1. HR defines three components, all effective Jan 1:
   - professional tax, FLAT 200;
   - retirement fund, 12% of basic capped at 1,800;
   - income tax, ANNUAL brackets 0% to 3L, 5% to 7L, then 20%.

   A bracket table without an open-ended last bracket is rejected. Employees and managers get
   403. Employee B is exempted from professional tax.
2. A March payroll run gives A: 200 + 1,800 + 6,000 (960,000 annual → 72,000 / 12), itemized
   apart from other deductions; net pay subtracts them. B has no professional-tax line.
3. Adding PT 300 from Mar 15 and PF 10% from Apr 1 doesn't change March's payslip; the report's
   grand total equals the sum of all March payslip lines.
4. Re-running March → PT 300; regenerating the report reflects it. April → PF 5,000.
5. Export → CSV with totals and per-employee lines. Discontinuing the components removes them
   from May.
