# Contract: Engagement Surveys (`/api/surveys`) — authenticated

| Method & path | Roles | Notes |
|---|---|---|
| POST `/` | ADMIN, HR | `{title, audienceType: COMPANY|DEPARTMENT, departmentId?, minResponses?, questions[{type: ENPS|TEXT, prompt}]}` (≥1 ENPS) → 201 sent |
| GET `/` · GET `/:id` | ADMIN, HR | with `responses`, `responseRate` |
| POST `/:id/close` | ADMIN, HR | 409 if closed |
| GET `/:id/results` | ADMIN, HR | `{withheld: true, message}` below `minResponses`; else per question `{enps, average, distribution[0..10]}` or `{texts[]}` |
| GET `/trend` | ADMIN, HR | `[{surveyId, title, sentAt, status, responseRate, enps, withheld}]` |
| GET `/pending` | any | open, unanswered surveys sent to the caller |
| POST `/:id/responses` | audience member | `{answers[{questionId, score?: 0-10, text?}]}`; 409 `ALREADY_RESPONDED` / `SURVEY_CLOSED`; 404 outside the audience |
