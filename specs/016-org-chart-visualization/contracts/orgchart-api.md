# Contract: Org Chart API (`/api/org-chart`) — authenticated

| Method & path | Roles | Response |
|---|---|---|
| GET `/?depth=` | any | `{totalEmployees, depth, roots: Node[], myPath: string[] \| null, cycleCount? (HR)}` |
| GET `/nodes/:id/children?depth=` | any | `Node[]` (direct reports, optionally deeper) |
| GET `/search?q=` | any | `[Node & {path: string[] \| null, inCycle}]`, `[]` when none |
| GET `/gaps` | ADMIN, HR | `{topEmployee, orphans[{id,name,reason}], headlessDepartments[{id,name,reason}], cycles[[{id,name}]]}` |
| PUT `/top` | ADMIN, HR | `{employeeId \| null}` → gaps |

`Node = {id, name, title, department, managerId, directReportCount, hasChildren, isMe,
email? (HR/Admin, self, manager), orphan? (HR/Admin), children?: Node[]}`

Also: `PATCH /api/departments/:id {headEmployeeId | null}` (Admin/HR).
