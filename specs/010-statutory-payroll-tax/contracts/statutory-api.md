# Contract: Statutory API (`/api/statutory`) — Admin/HR only

| Method & path | Notes |
|---|---|
| GET `/components` | `[{groupId, name, current, versions[]}]` |
| POST `/components` | `{name, ruleType: FLAT|PERCENTAGE|BRACKET, ruleConfig, effectiveFrom, country?}` → 201 version |
| POST `/components/:groupId/versions` | new rule `{ruleType, ruleConfig, effectiveFrom, name?}` or discontinue `{active: false, effectiveFrom}` |
| GET `/exemptions?employeeId&groupId` | |
| POST `/exemptions` | `{employeeId, groupId, reason?}` → 201; 409 `EXEMPTION_EXISTS` |
| DELETE `/exemptions/:id` | 204 |
| POST `/reports` | `{periodMonth, periodYear}` → 201 `{id, totals: {components[{groupId, name, totalWithheld, employeeCount}], grandTotal, payslipCount}}`; 404 `NO_PAYROLL_FOR_PERIOD` |
| GET `/reports?periodMonth&periodYear` · GET `/reports/:id` | |
| GET `/reports/:id/export` | `text/csv` attachment |

Rule configs:

- `FLAT {amount}`
- `PERCENTAGE {percent, base: BASIC|BASIC_PLUS_HRA|GROSS, cap?}`
- `BRACKET {base, period: MONTHLY|ANNUAL, brackets: [{upTo: number|null, percent}]}`

Payslips (`/api/payroll/payslips…`) gain
`statutoryDeductions: [{groupId, componentId, name, amount}]`.
