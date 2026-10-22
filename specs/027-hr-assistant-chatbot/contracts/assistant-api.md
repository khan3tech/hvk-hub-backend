# Contract: HR Assistant (`/api/assistant`)

| Method & path | Who | Notes |
|---|---|---|
| POST `/ask` | any | `{question}` → `{answers[], allAnswered}` (rate-limited) |
| GET `/knowledge` · GET `/knowledge/:id` | any | articles (answer sources) |
| POST `/knowledge` | Admin/HR | `{title, body, keywords[], policyId?}` → 201 |
| PATCH `/knowledge/:id` · DELETE `/knowledge/:id` | Admin/HR | takes effect on the next question |
| GET `/overview?from&to` | Admin/HR | `{from, to, questions, answered, unanswered, unansweredRate, topics[{topic, questions, unanswered}]}` |

Each answer part has this shape:

```
{ question, topic, answered,
  text,
  grounding: PERSONAL_DATA | SYSTEM_SETTING | POLICY | null,
  sources: [{ type, label, link }],
  reason?: OUT_OF_SCOPE | NO_GROUNDING | NO_RECORDS }
```

Source links are API paths:

- `/api/leave-balances/me`
- `/api/payroll/payslips/me/:id`
- `/api/expenses/claims/:id`
- `/api/helpdesk/tickets/me`
- `/api/leave-types`
- `/api/holidays`
- `/api/assistant/knowledge/:id`
- `/api/documents/:id/download`
