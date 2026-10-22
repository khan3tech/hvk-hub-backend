# Quickstart: Validate the Referral Program

```bash
npm run dev && node scripts/e2e/run-all.mjs 021
```

1. HR sets a bonus of 5,000 with 0 qualifying days. An employee refers Alex, whose application
   is tagged REFERRAL by them. Referring Alex again → 409; referring yourself → 400.
2. The referrer sees only the stage. When HR hires Alex, the bonus is PAYABLE straight away.
3. HR schedules it for June. The June payslip shows a "Referral bonus (Alex Fast)" line next to
   basic pay, and the referral turns PAID. Scheduling again → 409. Re-running June keeps one
   bonus line, and July has none.
4. With 30 days configured, Bea is referred; changing the config afterwards doesn't change Bea's
   terms. Hiring Bea → PENDING. Bea joins as an employee and is offboarded early → FORFEITED.
5. Cal is rejected → CLOSED_NO_BONUS, visible to the referrer. Employees can't list all
   referrals.
