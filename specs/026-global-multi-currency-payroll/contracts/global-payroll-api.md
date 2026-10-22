# Contract: Global / Multi-Currency Payroll (`/api/payroll`) — Admin/HR only

| Method & path | Notes |
|---|---|
| GET `/currency-settings` | `{defaultCountry, defaultCurrency, reportingCurrency, multiCountry}` |
| PUT `/currency-settings` | any of `{defaultCountry (2), defaultCurrency (3), reportingCurrency (3)}`; null clears; 400 on unknown codes |
| GET `/assignments/:employeeId` | `{current: context, history[{country, currency, effectiveFrom}]}` |
| POST `/assignments/:employeeId` | `{country, currency, effectiveFrom}` → 201 (same shape as GET) |
| GET `/exchange-rates?periodMonth&periodYear` | recorded rates |
| PUT `/exchange-rates` | `{fromCurrency, rate, periodMonth, periodYear}`; upserts into the reporting currency; 409 `REPORTING_CURRENCY_NOT_SET` |
| GET `/reporting-total?periodMonth&periodYear` | `{reportingCurrency, complete, missingRates[], totalNetPay|null, totalGross|null, byCurrency[{currency, countries[], payslipCount, netPay, gross, rate|null, convertedNetPay|null}]}` |

Context: `{mode: "SINGLE", currency}` or `{mode: "MULTI", country, currency, homeCountry}`. When
neither an assignment nor the defaults apply, it is `{mode: "MULTI", missing: true}`.

Changes to 004/010:
- `POST /payroll/runs` returns `byCountry[{country, currency, payslipCount, netPay}]`.
- New skip reasons: `NO_PAYROLL_COUNTRY`, `CURRENCY_MISMATCH`,
  `NO_STATUTORY_COMPONENTS_FOR_COUNTRY`.
- Payslips carry `currency` and `country`. Salary structures carry the employee's currency.
- `POST /statutory/components` `country` scopes a component to one country; untagged components
  belong to the home country.
