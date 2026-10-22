# Tasks: HR Assistant Chatbot

**Input**: plan.md, contracts/assistant-api.md, quickstart.md. Backend only.

- [X] T001 Migration `hr_assistant` (AssistantKnowledgeArticle); interactions stored without text or identity
- [X] T002 Intents: splitting, pluggable classifier, third-party detection, topic labels, article scoring
- [X] T003 US1: grounded leave balance, payslip explanation, expense and ticket status; refusal of others' data (FR-002, FR-003)
- [X] T004 US2: knowledge articles (HR/Admin), cited answers with policy links, decline without grounding, fresh reads (FR-004–006, FR-009)
- [X] T005 Multi-part answers (FR-010); unconfigured leave kinds routed to policy lookup
- [X] T006 US3: anonymized overview with unanswered rate and period filter (FR-007, FR-008)
- [X] T007 Unit tests (16); `scripts/e2e/027-assistant.mjs` (14 checks)
