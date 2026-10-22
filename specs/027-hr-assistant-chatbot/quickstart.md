# Quickstart: Validate the HR Assistant

```bash
npm run dev && node scripts/e2e/run-all.mjs 027
```

The script provisions its own organization.

1. "How many sick days do I have left?" matches `/leave-balances/me` exactly and links to it.
   "Explain my latest payslip" uses the real payslip and links to it. "What's Raj's salary?" is
   refused, and someone with no payslip gets "no records".
2. "What's our stance on remote work?" is declined. HR publishes a policy and writes an article
   linked to it. The same question is then answered with the article text, citing the policy,
   whose link opens. Editing the article changes the next answer.
3. "What's my leave balance and what's the policy on parental leave?" answers the first part and
   declines the second.
4. HR's overview shows 9 questions, 4 unanswered, topics including remote work and parental
   leave, and no identities. A past date range is empty. Employees get 403.
