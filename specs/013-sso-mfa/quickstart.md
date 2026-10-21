# Quickstart: Validate SSO & MFA

```bash
npm run dev && node scripts/e2e/run-all.mjs 013
```

1. A user enrolls an authenticator. A wrong code is rejected, and a correct one enrolls them.
2. Their password login now returns an MFA challenge with no session. A wrong code → 401; the
   right code → a session. Replaying that code → 401, and repeated bad codes → 429 locked. The
   challenge token can't be used as an access token.
3. HR resets their MFA, and they sign in with just a password again. An employee can't reset it.
4. HR requires MFA: a new hire's login says `enrollmentRequired`, and enrolling via the challenge
   completes sign-in.
5. HR configures Google (credentials not configured on the server). Enforcing SSO needs a
   break-glass Admin, and only an Admin can grant that. Once it's enforced, an employee's
   password login → 403 `SSO_REQUIRED` while the break-glass Admin still signs in. `/auth/sso/start`
   reports the missing credentials.
6. Turning enforcement off restores password sign-in at once.

To test a real Google/Microsoft round-trip, set the provider env vars and `PUBLIC_API_URL`, then
open `/api/auth/sso/start` in a browser.
