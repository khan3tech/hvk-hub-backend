# Contract: Mobile / PWA support

## Changed: `POST /api/auth/login`
Optional `deviceId` (8–100 chars, stable per installed-app instance). With it, the sign-in only
replaces that device's previous session; without it, the 001 single-session rule applies.

## Any mutating request
Optional header `Idempotency-Key: <≤200 chars>`. The first completed response for (caller,
method, path, key) is replayed for retries within 24 h (`Idempotent-Replayed: true`). A retry
while the first is still running → 409 `IDEMPOTENCY_IN_PROGRESS`.

## `/api/devices` (authenticated, self-service)

| Method & path | Notes |
|---|---|
| GET `/push-config` | `{enabled, vapidPublicKey}` |
| POST `/` | `{subscription: {endpoint (https), keys: {p256dh, auth}}, platform, deviceId?}` → 201 (keys never echoed) |
| GET `/me` | `[{id, platform, deviceId, registeredAt, lastSeenAt}]` |
| DELETE `/:id` | 204; 404 if not yours |

Push payload (service worker): `{title, body, url, type}`, where `url` is the notification's link.
