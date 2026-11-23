# Implementation Plan: AI HR Assistant with Actions

**Branch**: `030-ai-assistant` | **Date**: 2026-11-23 | **Spec**: [spec.md](./spec.md)

## Summary

An AI layer inside the existing `assistant` module:

- a server-hosted Claude tool-use loop (Messages API on Amazon Bedrock, through `AnthropicBedrockMantle`);
- read tools that call other modules' services as the asking user;
- action tools that never run directly: the loop stops, stores a pending action, and resumes when the user confirms or cancels through a second endpoint.

Conversations, including the model-visible history, are persisted per user. When AI isn't configured, the 027 keyword assistant is the fallback.

## Technical decisions

- **R1 — Surface**: Messages API with a manual loop, not the SDK tool runner or Managed Agents.
  - The human-in-the-loop confirmation spans separate HTTP requests, minutes apart, so loop state must live in our database between requests.
  - Managed Agents isn't available on Bedrock.
- **R2 — Provider and auth**: `new AnthropicBedrockMantle({ awsRegion })` using the AWS credential chain, which is the EC2 instance role in production; no key is stored.
  - Model `anthropic.claude-opus-5-5` by default (`ASSISTANT_MODEL`); effort `medium` (`ASSISTANT_EFFORT`).
  - Enabled when `ASSISTANT_PROVIDER=bedrock`.
- **R3 — Refusals**: Bedrock has no server-side `fallbacks`, so I use the SDK's `betaRefusalFallbackMiddleware([{ model: "anthropic.claude-opus-4-8" }])` on the client and `client.beta.messages.create`. If the whole chain still refuses, a polite fixed reply is shown, and it's never fed back as data.
- **R4 — Thinking**: Opus 5.5 always thinks adaptively (`thinking` omitted); `output_config.effort` controls depth. The full `response.content`, including thinking blocks, is stored and replayed unchanged (append-only history).
- **R5 — Tools**: JSON-schema tools with `strict: true` and `additionalProperties: false`; `tool_choice` stays `auto`, because forced tool use is a 400 on Opus 5.5. Inputs are parsed and validated with zod before use.
- **R6 — Actions**: when a response contains action `tool_use` blocks:
  - read tools in the same response run immediately and their results are held;
  - the first action becomes the pending action;
  - other actions in the same response get an error result: "one action at a time; propose it next".
  - On a decision, every `tool_result` for that assistant turn goes into a single user message, and the loop continues.
  - Confirm sets the status atomically (`updateMany` on `status = PENDING`), so it runs exactly once.
- **R7 — Caching**: top-level automatic `cache_control` on each request. Tools and the system prompt are stable; the date and user facts go in the system prompt, which changes daily.
- **R8 — Limits**: at most 8 model calls per user request; `max_tokens` 8000 (non-streaming); the model sees only the last ~40 messages, trimmed at a user-text boundary.
- **R9 — Retention**: an hourly job deletes conversations not updated for 90 days.

## Data model (migration `ai_assistant`)

- `AssistantConversation`:
  - `id`, `orgId`, `userId`, `employeeId?`, `title`;
  - `history Json` (Claude messages), `display Json` (DisplayMessage[]), `pending Json?`;
  - `createdAt`, `updatedAt`;
  - index `(orgId, userId, updatedAt)`.

Pending action JSON: `{ id, kind, toolUseId, input, title, fields, expiresAt, heldResults, status }`.

## Constitution Check

- I **PASS**: tools call other modules' services only.
- II **PASS**: zod schemas.
- III **PASS**: every tool runs as the actor, through the services' own checks.
- IV **PASS**: actions run only on confirmation, exactly once, through existing audited services.
- VI **PASS**: tenant-scoped.
- VII **PASS**: no manager/HR actions.

## Structure

```text
src/modules/assistant/ai/
  client.ts      provider factory (Bedrock) + ModelClient interface (fake in tests)
  tools.ts       tool definitions + executors (read) + action preparers/executors
  prompt.ts      system prompt builder
  chat.ts        conversation loop, pending actions, persistence
  routes additions in assistant/routes.ts
```
