# Quickstart: Validate the Public Careers Portal

```bash
npm run dev && node scripts/e2e/run-all.mjs 020
```

1. With no token: the open roles (with description and department) are listed, an on-hold role
   isn't, and an unknown org → 404.
2. Applying without solving the challenge → 400. A solved challenge (after the fill time) plus a
   PDF → 201 with a `TL-…` reference. HR's pipeline shows it at APPLIED with source PUBLIC.
3. The same email applying again → 409. Applying to another role works. An `.exe` → 415.
   Closing the role and applying → 409 POSTING_NOT_OPEN.
4. The status check shows "Received"; after HR rejects, "Not selected" (final). A wrong email
   and a wrong reference get the identical message.
5. HR deletes the candidate: the record, the resume download and the status lookup are all gone.
