# Contract: SSO & MFA

## Changed: `POST /api/auth/login`
When a second factor applies it returns `200 {mfaRequired: true, enrollmentRequired, mfaToken}`
with no session cookie. When SSO is enforced, a non-break-glass account gets 403 `SSO_REQUIRED`.

## Public sign-in steps (`/api/auth`, IP rate-limited)

| Method & path | Body | Result |
|---|---|---|
| POST `/mfa/verify` | `{mfaToken, code}` | session `{accessToken, user}` + cookie; 401 `INVALID_CODE`, 429 `MFA_LOCKED`, 401 `INVALID_SESSION` |
| POST `/mfa/enroll` | `{mfaToken}` | `{secret, otpauthUrl}` |
| POST `/mfa/enroll/confirm` | `{mfaToken, code}` | session; 400 `INVALID_CODE` |
| GET `/sso/start` | `?redirect=false` → `{url}` | 302 to provider; 404/503 `SSO_NOT_CONFIGURED` |
| GET `/sso/callback` | provider query | 302 to `PUBLIC_APP_URL/sso/complete` or `/login?ssoError=CODE` |

## Authenticated (`/api/identity`)

| Method & path | Roles | Notes |
|---|---|---|
| GET `/mfa/me` | any | `{enrolled, pending, required}` |
| POST `/mfa/enroll` · POST `/mfa/enroll/confirm` `{code}` | any | self-service setup |
| DELETE `/mfa/users/:userId` | ADMIN, HR | reset (lost device) → 204 |
| GET `/settings` · PUT `/settings` `{provider?, enforced?, mfaRequired?}` | ADMIN, HR | 409 `SSO_NOT_CONFIGURED` / `BREAK_GLASS_REQUIRED` |
| PUT `/break-glass/:userId` `{enabled}` | ADMIN | Admin accounts only; the last one can't be revoked while enforced |
