# Tasks: AI HR Assistant with Actions

**Input**: plan.md, contracts/assistant-chat-api.md. Backend only (frontend repo owns the chat UI).

- [X] T001 Add `@anthropic-ai/sdk` + `@anthropic-ai/bedrock-sdk`; `AssistantConversation` model + migration `ai_assistant`
- [X] T002 `ai/client.ts`: Bedrock Mantle client (AWS credential chain), refusal-fallback middleware, swappable `ModelClient`, env config (`ASSISTANT_PROVIDER`, `ASSISTANT_MODEL`, `ASSISTANT_EFFORT`, `ASSISTANT_AWS_REGION`)
- [X] T003 `ai/tools.ts`: 14 read tools + 7 action tools (prepare preview / execute after confirm), strict schemas, zod re-validation; `timetracking.describeTask` helper
- [X] T004 `ai/prompt.ts`: system prompt (stable part first for caching)
- [X] T005 `ai/chat.ts`: manual loop (≤8 calls), pending action persistence, atomic confirm (exactly once), cancel / new-message cancel / 15-min expiry, refusal handling, 503 on model failure with rollback, basic-mode fallback to 027
- [X] T006 Routes `/status`, `/chat`, `/chat/actions/:id`, `/conversations*` + OpenAPI; per-user rate limit; 90-day retention job
- [ ] T007 (deferred — tests postponed by the user; verified manually: 22/22 scripted fake-model checks against a real DB + HTTP smoke test) unit/e2e tests
- [ ] T008 Live check against Bedrock after model access is enabled and the EC2 role is granted `bedrock-mantle:CreateInference`
