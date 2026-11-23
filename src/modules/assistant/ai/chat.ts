// 030: the AI conversation loop with confirmation-gated actions (plan R1, R6). One user request
// runs the model until it answers or proposes an action; an action pauses the loop until the
// owner confirms or cancels through a separate request, minutes later — so all loop state lives
// in AssistantConversation, not in memory.
import { randomUUID } from "node:crypto";
import moment from "moment";
import { Anthropic } from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { logger } from "../../../lib/logger.js";
import { DomainError } from "../../../middleware/errorHandler.js";
import type { AccessTokenPayload } from "../../../lib/jwt.js";
import { getEmployeeSummary } from "../../employee/service.js";
import { ask } from "../service.js";
import { recordInteractions } from "../repository.js";
import { aiConfig, modelClient, type MessageParams, type ModelMessage } from "./client.js";
import { systemPrompt } from "./prompt.js";
import { TOOL_DEFS, executeAction, isAction, prepareAction, runRead, type ActionKind, type Ctx, type Source } from "./tools.js";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;
type ToolUse = Anthropic.Beta.Messages.BetaToolUseBlock;

const MAX_MODEL_CALLS = 8; // R8
const MAX_HISTORY = 160; // R8: a conversation this long must start fresh
const ACTION_TTL_MS = 15 * 60_000; // FR-004
const RETENTION_DAYS = 90; // FR-006

export interface ActionOutcome {
  id: string;
  kind: ActionKind;
  title: string;
  status: "CONFIRMED" | "CANCELLED" | "EXPIRED" | "FAILED";
  message: string;
  link: string | null;
}
export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  sources?: Source[];
  action?: ActionOutcome;
}
interface Pending {
  id: string;
  kind: ActionKind;
  title: string;
  fields: { label: string; value: string }[];
  expiresAt: string;
  toolUseId: string;
  toolName: string;
  input: unknown;
  held: ToolResult[]; // results for the other tool_use blocks of the same assistant turn
  status: "PENDING" | "DECIDING";
}
type Conversation = {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  history: MessageParam[];
  display: DisplayMessage[];
  pending: Pending | null;
  createdAt: Date;
  updatedAt: Date;
};

const now = () => new Date().toISOString();
const publicPending = (p: Pending | null) => (p && p.status === "PENDING" ? { id: p.id, kind: p.kind, title: p.title, fields: p.fields, expiresAt: p.expiresAt } : null);

export function status() {
  const c = aiConfig();
  return { mode: c.enabled ? ("ai" as const) : ("basic" as const), model: c.enabled ? c.model : null, actions: c.enabled };
}

// --- persistence ---

function toConversation(row: { id: string; orgId: string; userId: string; title: string; history: unknown; display: unknown; pending: unknown; createdAt: Date; updatedAt: Date }): Conversation {
  return { ...row, history: (row.history ?? []) as MessageParam[], display: (row.display ?? []) as DisplayMessage[], pending: (row.pending ?? null) as Pending | null };
}

async function load(orgId: string, userId: string, id: string) {
  const row = await prisma.assistantConversation.findFirst({ where: { id, orgId, userId } });
  if (!row) throw new DomainError("NOT_FOUND", "Conversation not found.", 404);
  return toConversation(row);
}

async function save(c: Conversation) {
  await prisma.assistantConversation.update({
    where: { id: c.id },
    data: {
      title: c.title,
      history: c.history as unknown as Prisma.InputJsonValue,
      display: c.display as unknown as Prisma.InputJsonValue,
      pending: c.pending ? (c.pending as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });
}

// --- context ---

async function contextFor(orgId: string, actor: AccessTokenPayload): Promise<Ctx & { name: string }> {
  if (!actor.employeeId) throw new DomainError("NO_EMPLOYEE_RECORD", "Your account isn't linked to an employee record.", 403);
  const me = await getEmployeeSummary(orgId, actor.employeeId);
  if (!me || me.status !== "ACTIVE") throw new DomainError("EMPLOYEE_INACTIVE", "Only active employees can use the assistant.", 403);
  return { orgId, actor, employeeId: actor.employeeId, name: me.name };
}

// --- pending action resolution (no model call) ---

function resolveTo(c: Conversation, status: ActionOutcome["status"], message: string, link: string | null, resultContent: string, isError: boolean) {
  const p = c.pending!;
  const outcome: ActionOutcome = { id: p.id, kind: p.kind, title: p.title, status, message, link };
  const results: ToolResult[] = [...p.held, { type: "tool_result", tool_use_id: p.toolUseId, content: resultContent, ...(isError ? { is_error: true } : {}) }];
  c.pending = null;
  return { outcome, results };
}

function expireOrCancel(c: Conversation, reason: "EXPIRED" | "CANCELLED") {
  const text =
    reason === "EXPIRED"
      ? "The user didn't confirm in time (15 minutes), so the action expired. Nothing was changed."
      : "The user cancelled this action (or moved on without confirming). Nothing was changed.";
  return resolveTo(c, reason, reason === "EXPIRED" ? "Expired before you confirmed. Nothing was changed." : "Cancelled. Nothing was changed.", null, text, false);
}

// --- the loop ---

interface LoopResult {
  messages: DisplayMessage[];
}

type UserBlock = ToolResult | Anthropic.Beta.Messages.BetaTextBlockParam;

async function runLoop(c: Conversation, ctx: Ctx & { name: string }, firstUser: UserBlock[], outcome: ActionOutcome | null): Promise<LoopResult> {
  const cfg = aiConfig();
  const client = modelClient();
  c.history.push({ role: "user", content: firstUser } as MessageParam);
  const texts: string[] = [];
  const sources: Source[] = [];
  const added: DisplayMessage[] = [];

  const finish = (fallbackText: string) => {
    const text = texts.join("\n\n").trim() || fallbackText;
    if (!text && !outcome) return;
    const uniq = sources.filter((s, i) => sources.findIndex((x) => x.label === s.label) === i);
    added.push({ id: randomUUID(), role: "assistant", text, createdAt: now(), ...(uniq.length ? { sources: uniq } : {}), ...(outcome ? { action: outcome } : {}) });
  };

  for (let call = 0; call < MAX_MODEL_CALLS; call++) {
    let response: ModelMessage;
    try {
      response = await client.create({
        model: cfg.model,
        max_tokens: 8000,
        system: systemPrompt({ name: ctx.name, role: ctx.actor.role }),
        tools: TOOL_DEFS,
        messages: c.history,
        output_config: { effort: cfg.effort },
        cache_control: { type: "ephemeral" },
      } as MessageParams);
    } catch (err) {
      logger.error({ err }, "assistant model call failed");
      throw new DomainError("ASSISTANT_UNAVAILABLE", "The assistant couldn't reach the AI service. Please try again.", 503);
    }

    // R3: a refusal that survived the fallback chain is answered politely and never replayed.
    if (response.stop_reason === "refusal") {
      texts.push("Sorry, I can't help with that one. I can help with your leave, attendance, time tracking, payslips, expenses, tickets and HR policies.");
      // Keep the history append-only: record a plain assistant turn instead of the refused content.
      c.history.push({ role: "assistant", content: [{ type: "text", text: "(declined)" }] });
      finish("");
      return { messages: added };
    }

    // Replayed unchanged on later calls (R4: thinking blocks included).
    c.history.push({ role: "assistant", content: response.content } as unknown as MessageParam);
    for (const block of response.content) if (block.type === "text" && block.text.trim()) texts.push(block.text.trim());

    if (response.stop_reason !== "tool_use") {
      finish(response.stop_reason === "max_tokens" ? "Sorry, that answer got too long. Could you ask about one thing at a time?" : "");
      return { messages: added };
    }

    const uses = response.content.filter((b): b is ToolUse => b.type === "tool_use");
    const results: ToolResult[] = [];
    let pending: Pending | null = null;

    for (const use of uses) {
      if (isAction(use.name)) {
        if (pending) {
          results.push({ type: "tool_result", tool_use_id: use.id, content: "Only one action can be proposed at a time. Propose this one after the user decides on the first.", is_error: true });
          continue;
        }
        try {
          const { preview, input } = await prepareAction(ctx, use.name, use.input);
          pending = {
            id: randomUUID(),
            kind: preview.kind,
            title: preview.title,
            fields: preview.fields,
            expiresAt: new Date(Date.now() + ACTION_TTL_MS).toISOString(),
            toolUseId: use.id,
            toolName: use.name,
            input,
            held: [],
            status: "PENDING",
          };
        } catch (err) {
          results.push({ type: "tool_result", tool_use_id: use.id, content: errorText(err), is_error: true });
        }
      } else {
        try {
          const r = await runRead(ctx, use.name, use.input);
          sources.push(...r.sources);
          results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(r.data) });
        } catch (err) {
          results.push({ type: "tool_result", tool_use_id: use.id, content: errorText(err), is_error: true });
        }
      }
    }

    if (pending) {
      pending.held = results;
      c.pending = pending;
      finish("");
      return { messages: added };
    }
    c.history.push({ role: "user", content: results });
  }

  texts.push("That took more steps than I can do at once. Could you break it into smaller questions?");
  finish("");
  return { messages: added };
}

function errorText(err: unknown) {
  if (err instanceof DomainError) return `Error ${err.code}: ${err.message}`;
  logger.error({ err }, "assistant tool failed");
  return "Error: something went wrong while doing that.";
}

// --- public API ---

export async function chat(orgId: string, actor: AccessTokenPayload, input: { message: string; conversationId?: string }) {
  const userId = actor.sub;
  const message = input.message.trim();
  if (!message) throw new DomainError("VALIDATION_ERROR", "Type a message.", 400);
  const userMsg: DisplayMessage = { id: randomUUID(), role: "user", text: message, createdAt: now() };

  let c: Conversation;
  let created = false;
  if (input.conversationId) {
    c = await load(orgId, userId, input.conversationId);
  } else {
    const row = await prisma.assistantConversation.create({
      data: { orgId, userId, employeeId: actor.employeeId, title: message.slice(0, 60), history: [], display: [] },
    });
    c = toConversation(row);
    created = true;
  }

  // FR-007: basic (keyword) mode.
  if (!aiConfig().enabled) {
    const r = await ask(orgId, message, actor);
    const reply: DisplayMessage = {
      id: randomUUID(),
      role: "assistant",
      text: r.answers.map((a) => a.text).join("\n\n"),
      createdAt: now(),
      sources: r.answers.flatMap((a) => a.sources.map((s) => ({ label: s.label, link: null }))),
    };
    c.display.push(userMsg, reply);
    await save(c);
    return { conversationId: c.id, mode: "basic" as const, messages: [userMsg, reply], pendingAction: null };
  }

  if (c.history.length >= MAX_HISTORY) {
    throw new DomainError("CONVERSATION_FULL", "This conversation is very long. Start a new chat to continue.", 409);
  }
  const ctx = await contextFor(orgId, actor);

  // FR-004: a new message cancels (or expires) a pending action; its results lead the user turn.
  const added: DisplayMessage[] = [];
  let lead: ToolResult[] = [];
  if (c.pending) {
    const expired = Date.parse(c.pending.expiresAt) < Date.now();
    const { outcome, results } = expireOrCancel(c, expired ? "EXPIRED" : "CANCELLED");
    lead = results;
    added.push({ id: randomUUID(), role: "assistant", text: outcome.message, createdAt: now(), action: outcome });
  }

  const snapshot = { history: [...c.history], display: [...c.display], pending: c.pending };
  try {
    const loop = await runLoop(c, ctx, [...lead, { type: "text", text: message }], null);
    c.display.push(...added, userMsg, ...loop.messages);
    await save(c);
    await recordInteractions([{ orgId, topic: "ai-chat", wasAnswered: true, groundingType: null, createdAt: moment.utc().startOf("day").toDate() }]);
    return { conversationId: c.id, mode: "ai" as const, messages: [...added, userMsg, ...loop.messages], pendingAction: publicPending(c.pending) };
  } catch (err) {
    // Nothing from this request is kept when the model call fails (no action ran).
    c.history = snapshot.history;
    c.display = snapshot.display;
    c.pending = snapshot.pending;
    if (created) await prisma.assistantConversation.deleteMany({ where: { id: c.id } });
    throw err;
  }
}

export async function decide(orgId: string, actor: AccessTokenPayload, actionId: string, decision: "confirm" | "cancel") {
  if (!aiConfig().enabled) throw new DomainError("NOT_FOUND", "Action not found.", 404);
  const row = await prisma.assistantConversation.findFirst({
    where: { orgId, userId: actor.sub, pending: { path: ["id"], equals: actionId } },
  });
  if (!row) throw new DomainError("NOT_FOUND", "Action not found.", 404);

  // FR-005: claim the action atomically so a double click runs it once.
  const claimed = await prisma.assistantConversation.updateMany({
    where: { id: row.id, pending: { path: ["status"], equals: "PENDING" } },
    data: { pending: { ...(row.pending as object), status: "DECIDING" } as Prisma.InputJsonValue },
  });
  if (claimed.count !== 1) throw new DomainError("ACTION_ALREADY_DECIDED", "This action was already decided.", 409);

  const c = toConversation({ ...row, pending: { ...(row.pending as object), status: "DECIDING" } });
  const ctx = await contextFor(orgId, actor);
  const p = c.pending!;

  if (Date.parse(p.expiresAt) < Date.now()) {
    const { outcome, results } = expireOrCancel(c, "EXPIRED");
    c.history.push({ role: "user", content: results });
    const msg: DisplayMessage = { id: randomUUID(), role: "assistant", text: outcome.message, createdAt: now(), action: outcome };
    c.display.push(msg);
    await save(c);
    throw new DomainError("ACTION_EXPIRED", "This action expired before it was confirmed. Nothing was changed.", 410);
  }

  let resolved: { outcome: ActionOutcome; results: ToolResult[] };
  if (decision === "cancel") {
    resolved = expireOrCancel(c, "CANCELLED");
  } else {
    try {
      const r = await executeAction(ctx, p.toolName, p.input);
      resolved = resolveTo(c, "CONFIRMED", r.message, r.link, JSON.stringify({ done: true, message: r.message, ...(r.data ? { data: r.data } : {}) }), false);
    } catch (err) {
      const message = err instanceof DomainError ? err.message : "Something went wrong while doing that.";
      if (!(err instanceof DomainError)) logger.error({ err }, "assistant action failed");
      resolved = resolveTo(c, "FAILED", message, null, errorText(err), true);
    }
  }

  // The action has run (or not): persist that before asking the model for a follow-up.
  c.history.push({ role: "user", content: resolved.results });
  const outcomeMsg: DisplayMessage = { id: randomUUID(), role: "assistant", text: "", createdAt: now(), action: resolved.outcome };
  await save({ ...c, display: [...c.display, { ...outcomeMsg, text: resolved.outcome.message }] });

  // Continue the conversation so the assistant can acknowledge (and maybe propose the next step).
  c.history.pop();
  try {
    const loop = await runLoop(c, ctx, resolved.results, resolved.outcome);
    const messages = loop.messages.length ? loop.messages : [{ ...outcomeMsg, text: resolved.outcome.message }];
    c.display.push(...messages);
    await save(c);
    return { conversationId: c.id, mode: "ai" as const, messages, pendingAction: publicPending(c.pending) };
  } catch {
    // The follow-up failed but the action result is already saved above.
    const msg = { ...outcomeMsg, text: resolved.outcome.message };
    return { conversationId: c.id, mode: "ai" as const, messages: [msg], pendingAction: null };
  }
}

export async function listConversations(orgId: string, actor: AccessTokenPayload) {
  const rows = await prisma.assistantConversation.findMany({
    where: { orgId, userId: actor.sub },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true, pending: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updatedAt.toISOString(),
    hasPendingAction: Boolean(r.pending && (r.pending as unknown as Pending).status === "PENDING" && Date.parse((r.pending as unknown as Pending).expiresAt) > Date.now()),
  }));
}

export async function getConversation(orgId: string, actor: AccessTokenPayload, id: string) {
  const c = await load(orgId, actor.sub, id);
  const pending = c.pending && Date.parse(c.pending.expiresAt) > Date.now() ? publicPending(c.pending) : null;
  return { id: c.id, title: c.title, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(), messages: c.display, pendingAction: pending };
}

export async function deleteConversation(orgId: string, actor: AccessTokenPayload, id: string) {
  const r = await prisma.assistantConversation.deleteMany({ where: { id, orgId, userId: actor.sub } });
  if (r.count === 0) throw new DomainError("NOT_FOUND", "Conversation not found.", 404);
}

// FR-006 / R9
export async function purgeOldConversations(nowDate = new Date()) {
  const cutoff = new Date(nowDate.getTime() - RETENTION_DAYS * 86_400_000);
  return (await prisma.assistantConversation.deleteMany({ where: { updatedAt: { lt: cutoff } } })).count;
}
