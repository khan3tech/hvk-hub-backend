# Contract: Analytics API (`/api/analytics`) — Admin/HR only

Every endpoint accepts `?format=csv` to download its table.

| Method & path | Query | Response |
|---|---|---|
| GET `/headcount` | `from, to` (YYYY-MM-DD) | `{asOf, total, byDepartment[{id,name,count}], byDesignation[…], trend[{month, headcount, joins, exits}], note?}` |
| GET `/attrition` | `from, to` | `{exits, averageHeadcount, ratePercent, byDepartment[{id,name,exits,averageHeadcount,ratePercent}], tenure{employees, averageDays, averageYears}}` |
| GET `/leave-usage` | `from, to, departmentId?` | `{totalDays, byLeaveType[{leaveTypeId, name, days, requests}]}` |
| GET `/payroll-cost` | `from, to` (YYYY-MM) | `{periods[{period, periodYear, periodMonth, payslipCount, gross, statutory, netPay}], note?}` |

Missing department or designation → `id: "unassigned"`. 400 on an invalid or inverted range.
