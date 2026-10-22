# Contract: HR Helpdesk API (`/api/helpdesk`) — authenticated

| Method & path | Roles | Notes |
|---|---|---|
| GET `/categories?all` | any | defaults seeded per org |
| POST `/categories` · PATCH `/categories/:id` | ADMIN, HR | `{name}` / `{name?, active?}` |
| GET `/settings` · PUT `/settings` | ADMIN, HR | `{overdueHours}` |
| GET `/summary` | ADMIN, HR | `{overdueHours, categories[{categoryId, name, open, resolved, averageResolutionHours}]}` |
| POST `/tickets` | any employee | `{categoryId, subject, description}` → 201 OPEN |
| GET `/tickets/me` | any | own tickets |
| GET `/tickets?status&categoryId&includeResolved` | ADMIN, HR | active by default; `overdue`, `unassigned` flags |
| GET `/tickets/:id` | requester, ADMIN, HR | includes `replies[]`; 404 for others |
| POST `/tickets/:id/assign` | ADMIN, HR | `{assigneeId}` (active HR/Admin) |
| POST `/tickets/:id/replies` | requester, ADMIN, HR | `{message}`; 409 on resolved |
| POST `/tickets/:id/resolve` | ADMIN, HR | 409 if already resolved |
| POST `/tickets/:id/reopen` | requester | 409 unless resolved |
