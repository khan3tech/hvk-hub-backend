# Contract: Notifications API (`/api/notifications`)

All endpoints require `authenticate` and act only on the caller's own notifications.

| Method & path | Response |
|---|---|
| GET `/?unreadOnly&before&limit` | `{ items: [{id, type, message, link, read, createdAt}], unreadCount }`, newest first (default 30, max 100; `before` = ISO timestamp cursor) |
| GET `/unread-count` | `{ unreadCount }` |
| POST `/:id/read` | `{ unreadCount }`; 404 if missing or not the caller's |
| POST `/read-all` | `{ unreadCount: 0 }` |

Notification `type` values: `LEAVE_DECIDED`, `LEAVE_PENDING_APPROVAL`, `PAYROLL_RUN_COMPLETED`,
`INTERVIEW_SCHEDULED`, `INTERVIEW_RESULT_RECORDED`.
