# Quickstart: Validate Documents & e-Signature

```bash
npm run dev && node scripts/e2e/run-all.mjs 008
```

1. HR uploads "PAN card" for an employee, then again: v1 and v2 both listed with `?history=true`,
   v2 current. The employee downloads it; their manager gets 403; a `managerVisible` document is
   the only one the manager sees; an unrelated employee gets 403.
2. An `.exe`, a fake PDF and an 11 MB file are rejected (415, 415, 413) before storage.
3. HR sends the contract for signature: AWAITING for both sides, the recipient is notified,
   another employee can't sign, the recipient signs (name + timestamp), re-signing → 409.
4. HR uploads an offer letter for a candidate and requests a signature tied to the application:
   the private link opens without login, the file downloads, the candidate signs, and
   `GET /documents/signatures?applicationId=` shows it SIGNED.
5. HR publishes a policy; employees see it pending and can read its file; acknowledging is
   one idempotent call; HR's status shows the acknowledger and a later joiner as pending.
