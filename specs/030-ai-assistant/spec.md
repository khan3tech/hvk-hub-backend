# Feature Specification: AI HR Assistant with Actions

**Feature Branch**: `030-ai-assistant`

**Created**: 2026-11-23

**Status**: Draft

**Input**: User description: "Upgrade the HR assistant bot to AI (Claude via AWS Bedrock) that understands any phrasing and follow-ups, answers from the user's own data, and can take actions — apply leave, log time / start or stop the timer, raise a helpdesk ticket, check in/out — after the user confirms."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask anything about your own HR data, in a conversation (Priority: P1)

An employee chats with the assistant in plain language: "how many casual leaves do I have?", "and sick?", "what did I get paid last month and why is it lower?", "when's the next holiday?", "how many hours did I log this week?". It answers from their real records, keeps context across follow-ups, and says where the answer came from.

**Why this priority**: The core upgrade over the keyword bot. Answers must stay as trustworthy as 027's.

**Independent Test**: Ask about leave balance, then a follow-up "and sick leave?", and confirm both answers match the Leave page.

**Acceptance Scenarios**:

1. **Given** an employee, **When** they ask about their own leave, payslips, attendance, timesheet, timer, projects, expenses, tickets, holidays or company policies, **Then** the answer uses only data retrieved for them in that conversation and names the source.
2. **Given** a follow-up that depends on the previous answer, **When** asked, **Then** the assistant answers it in context.
3. **Given** a question about another person's private data, **When** asked, **Then** the assistant declines; it can never see more than the user can see elsewhere in Hvk Hub.
4. **Given** a question the data can't answer, **When** asked, **Then** it says so and suggests raising a helpdesk ticket, never inventing numbers or policies.

---

### User Story 2 - Do things by asking, with confirmation (Priority: P1)

The employee asks the assistant to do something: "apply casual leave for 2–3 Dec, family function", "start my timer on Website design", "log 2 hours on API review yesterday", "check me in", "raise a ticket that my payslip is missing HRA". The assistant prepares the action and shows a confirmation card with exactly what will happen; nothing changes until the user clicks Confirm. Afterwards it reports the result.

**Why this priority**: The user explicitly asked for actions; the confirmation rule is what makes it safe.

**Independent Test**: Ask to apply leave, check the card shows type, dates, days and reason, confirm, and see the request on the Leave page; repeat and cancel, and see nothing created.

**Acceptance Scenarios**:

1. **Given** a request that changes data, **When** the assistant has enough detail, **Then** a confirmation card appears listing every field; nothing is changed yet.
2. **Given** a confirmation card, **When** the user confirms, **Then** the action runs as that user (same rules and errors as doing it by hand) and the assistant reports success or the exact reason it failed.
3. **Given** a confirmation card, **When** the user cancels, sends a different message instead, or waits more than 15 minutes, **Then** nothing is changed.
4. **Given** missing details (e.g. which leave type), **When** asked, **Then** the assistant asks a short follow-up question before proposing the action.
5. **Given** one message asking for two actions, **Then** they're proposed one at a time.

---

### User Story 3 - Conversation history (Priority: P2)

Users can come back to earlier conversations, start a new one, or delete one. Only the owner can see a conversation.

**Acceptance Scenarios**:

1. **Given** past conversations, **When** the user opens the assistant, **Then** they see a list (title, last updated) and can reopen one with its messages.
2. **Given** a conversation, **When** the owner deletes it, **Then** it's gone; no one else (including HR) can read it.

---

### User Story 4 - Works without AI configured (Priority: P2)

If the AI isn't configured or is unavailable, the assistant keeps working in the existing keyword mode (027) and says actions need the AI to be enabled.

**Acceptance Scenarios**:

1. **Given** no AI configuration, **When** a user chats, **Then** they get 027's grounded answers, and the status shows "basic mode".
2. **Given** the AI service errors or times out, **When** a user chats, **Then** they get a friendly error and can retry; no action is ever half-done.

### Edge Cases

- A confirmation clicked twice → the action runs once.
- A confirmation for someone else's conversation, or an already-decided one → refused.
- The AI declines a request on safety grounds → a short polite message; the conversation remains usable.
- Very long conversations → older turns are trimmed from what the AI sees (the user still sees them).
- Conversations are deleted automatically after 90 days.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The assistant MUST answer only from data fetched through Hvk Hub's own services as the asking user, with the same permission checks.
- **FR-002**: Read capabilities: own profile, leave balances and requests, leave types, holidays, payslips, attendance (today and recent), timesheet week, running timer, time-tracking projects and tasks, expense claims, helpdesk tickets and categories, HR knowledge articles and published policies.
- **FR-003**: Actions: apply leave, check in, check out, log time, start timer, stop timer, raise helpdesk ticket.
- **FR-004**: Every action MUST be shown to the user as a confirmation with all its fields and run only after explicit confirmation by the same user; cancel, a new message, or 15 minutes without a decision MUST cancel it.
- **FR-005**: A confirmed action MUST run exactly once and its result (success or error message) MUST be reported back to the user and the AI.
- **FR-006**: Conversations MUST be private to their owner, listable, reopenable and deletable, and deleted after 90 days.
- **FR-007**: The assistant MUST fall back to the 027 keyword assistant when AI is not configured.
- **FR-008**: The AI provider MUST be Claude on Amazon Bedrock, authenticated with the server's AWS role (no API key stored), with model and effort configurable by environment.
- **FR-009**: Chat requests MUST be rate-limited per user (as 027).
- **FR-010**: 027's anonymised usage counting MUST continue (topic, answered or not), without storing question text in analytics.

### Key Entities

- **Conversation**: owner (user and employee), title, the AI-visible history, the displayed messages, an optional pending action, timestamps.
- **Pending Action**: one proposed change awaiting confirmation: kind, fields, human-readable summary, expiry.

## Success Criteria *(mandatory)*

- **SC-001**: For questions covered by FR-002, 100% of numeric answers match the corresponding Hvk Hub page.
- **SC-002**: 0 actions run without an explicit confirmation by the same user.
- **SC-003**: Typical replies arrive within 10 seconds.
- **SC-004**: Access tests across all four roles show no data outside the user's own scope.

## Assumptions

- Claude Opus 5.5 on Bedrock's global endpoint from ap-south-1 is the default model; an organization can switch to Claude Haiku 5.5 for lower cost via configuration.
- The organization owner enables Claude model access in the AWS Bedrock console; the EC2 role is granted `bedrock-mantle:CreateInference`.
- Self-service only in this version: no manager or HR actions (approvals) through the assistant.
- Conversation text is sent to Claude on Amazon Bedrock for processing; HR should mention this in their privacy notice.
