# Contract: AI Assistant Chat API (`/api/assistant`): authenticated

027's endpoints (`POST /ask`, `/knowledge*`, `/overview`) are unchanged. New endpoints:

## Shapes
```ts
Status          { mode: "ai" | "basic", model: string | null, actions: boolean }

DisplayMessage  { id: string, role: "user" | "assistant", text: string, createdAt: string,
                  sources?: { label: string, link: string | null }[],     // what the answer used
                  action?: ActionOutcome }                                 // on the assistant message that reports an action

PendingAction   { id: string, kind: ActionKind, title: string,            // e.g. "Apply leave"
                  fields: { label: string, value: string }[],             // every value that will be submitted, human-readable
                  expiresAt: string }

ActionOutcome   { id: string, kind: ActionKind, title: string,
                  status: "CONFIRMED" | "CANCELLED" | "EXPIRED" | "FAILED", message: string,
                  link: string | null }                                    // app route to the created record, when there is one

ActionKind      "APPLY_LEAVE" | "CHECK_IN" | "CHECK_OUT" | "LOG_TIME" | "START_TIMER" | "STOP_TIMER" | "RAISE_TICKET"

Turn            { conversationId: string, mode: "ai" | "basic",
                  messages: DisplayMessage[],                              // the messages added by this request, in order
                  pendingAction: PendingAction | null }

ConversationSummary { id, title, updatedAt, hasPendingAction: boolean }
Conversation        { id, title, createdAt, updatedAt, messages: DisplayMessage[], pendingAction: PendingAction | null }
```

## Endpoints
| Method & path | Notes / errors |
|---|---|
| GET `/status` | → `Status` |
| POST `/chat` | `{ message: string (1–2000), conversationId?: string }` → `Turn`. Without `conversationId` a new conversation is created. A pending action in that conversation is cancelled first (FR-004). Rate-limited (429). 404 `NOT_FOUND` for someone else's conversation. 503 `ASSISTANT_UNAVAILABLE` when the AI call fails (nothing changed; retry). In basic mode it answers from 027 and never proposes actions. |
| POST `/chat/actions/:actionId` | `{ decision: "confirm" \| "cancel" }` → `Turn` (contains the assistant's follow-up message with `action` outcome, and possibly a new `pendingAction`). 404 unknown, or not yours; 409 `ACTION_ALREADY_DECIDED`; 410 `ACTION_EXPIRED` (also returns nothing changed). |
| GET `/conversations` | → `ConversationSummary[]` (own, newest first, max 50) |
| GET `/conversations/:id` | → `Conversation` (own only, else 404) |
| DELETE `/conversations/:id` | → 204 (own only) |

## Client behaviour (frontend)
- Show `Status.mode`; in `basic` say "Basic mode: AI isn't enabled, so I can answer common questions but can't take actions".
- Render `pendingAction` as a card with its `fields`, **Confirm** and **Cancel** buttons; disable both after one click. Show `expiresAt` as a countdown or "expires in N min".
- Sending a new message while a card is pending: warn inline that it will cancel the pending action.
- Assistant `text` is Markdown (bold, lists, simple tables); render safely (no raw HTML).
- `sources` as small chips under the message; `action` outcomes as a compact status row with a link.
- AI replies can take several seconds: show a typing indicator; keep the input usable after errors.
