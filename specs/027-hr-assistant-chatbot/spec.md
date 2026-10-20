# Feature Specification: HR Assistant Chatbot

**Feature Branch**: `027-hr-assistant-chatbot`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "A natural-language HR assistant — 'what's my leave balance,' 'explain this payslip,' company policy lookup — instead of navigating to the right screen for every simple question."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Employee asks the assistant about their own HR data (Priority: P1)

An employee asks a plain-language question about their own data — their leave balance, their
most recent payslip, whether their latest expense claim was approved — and gets a direct,
accurate answer instead of navigating to the relevant screen themselves.

**Why this priority**: This is the core value proposition — answering questions about data that
already exists elsewhere in the system, faster than clicking through to it.

**Independent Test**: Ask "how many sick days do I have left" as a test employee with a known
leave balance, and confirm the assistant's answer matches the actual balance shown on the Leave
page (003).

**Acceptance Scenarios**:

1. **Given** an employee with a known leave balance, **When** they ask the assistant about it in
   plain language, **Then** the answer matches the balance shown on the Attendance & Leave (003)
   page exactly.
2. **Given** an employee asking about their latest payslip, **When** they ask the assistant to
   explain a specific deduction, **Then** the answer reflects the actual itemized breakdown from
   that payslip (Payroll, 004 / Statutory Payroll Tax, 010), not a generic explanation
   disconnected from their real numbers.
3. **Given** an employee asking about another employee's data (e.g., "what's Priya's salary"),
   **When** they ask, **Then** the assistant refuses, consistent with that data being outside
   their own RBAC scope (Authentication & RBAC, 001) — the assistant never has broader access
   than the asking user already has.

---

### User Story 2 - Employee asks a company-policy question (Priority: P1)

An employee asks a general question about company policy — how many days of notice are required
to resign, what the process is for expense claims — and the assistant answers from the
company's actual configured policy content, not a generic guess.

**Why this priority**: Equally high-value as personal-data lookup and often the more frequent
question type in practice — reduces the volume of simple questions that would otherwise become
HR Helpdesk (017) tickets.

**Independent Test**: Ask a policy question that has a corresponding published policy document
(Document Management, 008) or configured company setting, and confirm the assistant's answer is
grounded in that actual content rather than a plausible-sounding but unverified answer.

**Acceptance Scenarios**:

1. **Given** a published company policy covering a topic, **When** an employee asks about it,
   **Then** the assistant's answer is grounded in that policy's actual content and cites which
   policy it came from.
2. **Given** a question with no corresponding configured policy or system data to ground an
   answer in, **When** an employee asks it, **Then** the assistant clearly states it doesn't have
   an answer rather than inventing a plausible-sounding one.
3. **Given** an answer the assistant provides, **When** the employee wants to verify it,
   **Then** they can follow a link/reference to the source screen or document it was grounded in.

---

### User Story 3 - HR reviews what employees are asking (Priority: P2)

HR/Admin sees an aggregated, anonymized view of common question topics and how often the
assistant couldn't answer, to spot policy gaps or documentation that needs writing.

**Why this priority**: Valuable operational feedback loop, but the assistant already delivers
its core value (P1) to employees without HR needing this analytics layer.

**Independent Test**: Generate a mix of answerable and unanswerable questions across test
accounts, and confirm HR's topic overview reflects accurate volume and a distinct
"couldn't answer" rate, without exposing which individual employee asked what.

**Acceptance Scenarios**:

1. **Given** a volume of assistant interactions, **When** HR/Admin views the topic overview,
   **Then** they see common question topics grouped, without any individual employee's identity
   attached to a specific question.
2. **Given** questions the assistant couldn't answer, **When** HR/Admin views the overview,
   **Then** they see this as a distinct, trackable rate, useful for identifying missing policy
   documentation.
3. **Given** HR/Admin viewing the overview, **When** they filter by time period, **Then** the
   topic breakdown reflects only that period's interactions.

### Edge Cases

- What happens if an employee tries to use the assistant to work around an RBAC restriction
  (e.g., asking indirectly for a colleague's salary)? The assistant MUST apply the same
  Authentication & RBAC (001) scoping as the rest of the system to every question — it is a new
  interface onto existing data, never a new access path.
- What happens if the assistant is uncertain whether it has enough grounding to answer
  confidently? It MUST decline rather than guess, consistent with User Story 2's "doesn't have an
  answer" requirement — a confidently wrong HR answer is worse than no answer.
- What happens if company policy content changes after the assistant has already answered a
  similar question to someone else? The assistant MUST answer from current policy content at the
  time of each question — it does not cache or reuse a stale prior answer.
- How does the system handle a question that mixes an answerable and an unanswerable part (e.g.,
  "what's my leave balance and what's our stance on remote work")? The assistant MUST answer the
  grounded part and clearly flag the ungrounded part separately, rather than either refusing the
  whole question or guessing on the ungrounded part.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let any authenticated employee ask the assistant a plain-language
  question and receive an answer.
- **FR-002**: System MUST ground every answer about personal HR data (leave balance, payslip
  detail, expense/claim status, etc.) in that employee's actual current records from the relevant
  module, never a generic or invented figure.
- **FR-003**: System MUST apply the same Authentication & RBAC (001) scoping to every assistant
  question as applies to the equivalent direct action in the system — the assistant MUST NOT
  answer with data the asking user could not otherwise access.
- **FR-004**: System MUST ground policy-question answers in actual published company policy
  content (e.g., from Document Management, 008) or configured system settings, and MUST cite the
  source.
- **FR-005**: System MUST explicitly decline to answer, rather than provide an unverified or
  invented answer, when it lacks sufficient grounding for a question.
- **FR-006**: System MUST let the employee follow a reference from an assistant answer back to
  the source screen or document it was grounded in.
- **FR-007**: System MUST provide HR/Admin an aggregated, anonymized view of common question
  topics and the rate of unanswerable questions, with no individual employee's identity
  attributable to a specific question in that view.
- **FR-008**: System MUST let HR/Admin filter the question-topic overview by time period.
- **FR-009**: System MUST re-evaluate policy content at the time of each question rather than
  reusing a cached answer that could reflect outdated policy.
- **FR-010**: System MUST separately address the grounded and ungrounded parts of a single
  multi-part question rather than treating the whole question as one unit to answer or refuse.

### Key Entities

- **Assistant interaction**: One question-and-answer exchange — the question, the answer, which
  records/policies it was grounded in (if any), and whether it was answered or declined. Stored
  in a form that supports anonymized aggregation without retaining an identity link usable in
  the HR-facing overview.
- **Grounding source**: A reference to the specific record (e.g., a LeaveBalance, a Payslip) or
  policy document an answer was based on.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An employee gets an answer to a personal-data question (e.g., leave balance) that
  exactly matches the equivalent system screen, in 100% of test cases.
- **SC-002**: Zero cases, during acceptance testing, of the assistant returning data outside the
  asking user's RBAC scope.
- **SC-003**: Zero cases, during testing, of the assistant providing a fabricated answer to a
  question with no available grounding — it correctly declines every time.
- **SC-004**: HR can identify the top question topics and the unanswered-question rate for a
  chosen period in a single view, in under 15 seconds.
- **SC-005**: An employee can get an answer to a typical question in under 15 seconds from asking
  it.

## Assumptions

- The assistant answers questions about existing system data and published policy content; it
  does not perform actions on the employee's behalf (e.g., it cannot file a leave request or
  submit a ticket for them) in v1.2 — it is read-only/informational.
- Voice input/output is out of scope for v1.2; the assistant is text-based.
- This feature depends on Authentication & RBAC (001) for scoping and draws grounding data from
  whichever other modules are present (Attendance & Leave 003, Payroll 004, Statutory Payroll Tax
  010, Document Management 008); it degrades gracefully (fewer answerable topics) in a deployment
  where some of those modules aren't yet built, rather than failing entirely.
- Multilingual support is a reasonable future extension but not required for the initial v1.2
  pass.
