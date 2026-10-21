# Contract: Assets (`/api/assets`) & Expenses (`/api/expenses`) — authenticated

## Assets (Admin/HR unless noted; Admin covers the "IT" role)

| Method & path | Notes |
|---|---|
| POST `/` | `{description, identifier}` → 201 UNASSIGNED; 409 `IDENTIFIER_TAKEN` |
| GET `/?status` · GET `/:id` | `:id` includes assignment `history` |
| GET `/employees/:employeeId` | self / their manager / HR — assets currently held |
| POST `/:id/assign` | `{employeeId}`; 409 `ASSET_UNAVAILABLE`; completes the onboarding `ASSET_ASSIGNMENT` task |
| POST `/:id/return` | → UNASSIGNED; the employee's last release completes the exit `ASSET_RETURN` task |
| POST `/:id/mark` | `{status: LOST | DAMAGED}` |

`GET /employees[/:id]` adds `assignedAssets`. The exit task `ASSET_RETURN` can't be completed
by hand while assets remain (409 `TASK_BLOCKED`).

## Expenses

| Method & path | Roles | Notes |
|---|---|---|
| GET `/categories?all` | any | |
| POST `/categories` · PATCH `/categories/:id` | ADMIN, HR | `{name, requiresReceipt}` / `{requiresReceipt?, active?}` |
| POST `/claims` | any employee | multipart `amount, category, description?, file?`; 400 `RECEIPT_REQUIRED` |
| GET `/claims/me` | any | |
| GET `/claims/queue` | MANAGER (current reports), HR/Admin (all) | pending |
| GET `/claims/:id` · GET `/claims/:id/receipt` | claimant, current manager, HR/Admin | |
| POST `/claims/:id/approve` · POST `/claims/:id/reject` `{reason}` | current manager, HR/Admin | 409 `ALREADY_DECIDED` |
| POST `/claims/:id/pay` | ADMIN, HR | APPROVED → PAID |
| GET `/payouts` | ADMIN, HR | `{outstandingTotal, outstandingCount, outstanding[]}` |
