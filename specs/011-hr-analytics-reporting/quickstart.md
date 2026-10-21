# Quickstart: Validate HR Analytics

```bash
npm run dev && node scripts/e2e/run-all.mjs 011
```

1. Headcount total equals the sum of the department buckets and of the designation buckets.
2. Hiring into a new department adds 1 to the total, that department and this month's trend
   joins.
3. Offboarding someone removes them from the current total. This month's attrition counts the
   exit for their department, and the rate equals exits ÷ average headcount. Tenure is reported.
4. An approved leave adds its days to that department's leave usage.
5. The latest payroll-cost period equals the sum of that period's payslips.
6. Managers get 403; `?format=csv` downloads a CSV.
