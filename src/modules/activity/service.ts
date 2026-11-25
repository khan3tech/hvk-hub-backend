// Business rules for activity & presence. Framework-agnostic — no req/res.
// Implements specs/029-activity-presence/spec.md (decisions in research.md).
import type { ActivityState } from "@prisma/client";
import { DomainError } from "../../middleware/errorHandler.js";
import { getEmployeeSummary, listActiveEmployeeSummaries, listDirectReportIds } from "../employee/service.js";
import { getAttendanceState } from "../attendance/service.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import { localDate, toDbDate } from "../timetracking/week.js";
import * as repo from "./repository.js";

export const PRESENCE_WINDOW_MS = 150_000; // R4 / FR-002 / FR-004
export const THROTTLE_MS = 20_000; // R3 / FR-003
export const RETENTION_DAYS = 90; // R7 / FR-011
export const DEFAULT_SETTINGS = { enabled: true, idleThresholdMinutes: 5 } as const;
// R5: Asia/Kolkata (ORG_TIME_ZONE in 028) is a fixed UTC+05:30 with no DST.
const ORG_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

export type PresenceStatus = "ACTIVE" | "AWAY" | "OFFLINE";

const isHr = (actor: AccessTokenPayload) => actor.role === "HR" || actor.role === "ADMIN";

function requireEmployee(actor: AccessTokenPayload): string {
  if (!actor.employeeId) throw new DomainError("NO_EMPLOYEE_RECORD", "Your account isn't linked to an employee record.", 403);
  return actor.employeeId;
}

// --- Settings (US5) ---

export async function getSettings(orgId: string) {
  const s = await repo.findSettings(orgId);
  return { enabled: s?.enabled ?? DEFAULT_SETTINGS.enabled, idleThresholdMinutes: s?.idleThresholdMinutes ?? DEFAULT_SETTINGS.idleThresholdMinutes };
}

export async function updateSettings(orgId: string, input: { enabled?: boolean; idleThresholdMinutes?: number }) {
  const s = await repo.upsertSettings(orgId, input);
  return { enabled: s.enabled, idleThresholdMinutes: s.idleThresholdMinutes };
}

// --- Pure rules (exported for unit tests) ---

// R4 / FR-004.
export function presenceStatus(p: { state: ActivityState; lastSeenAt: Date } | null | undefined, now: Date, enabled = true): PresenceStatus {
  if (!enabled || !p || now.getTime() - p.lastSeenAt.getTime() > PRESENCE_WINDOW_MS) return "OFFLINE";
  return p.state === "ACTIVE" ? "ACTIVE" : "AWAY";
}

// R2 / FR-002: how a report at `now` applies to the latest span.
export function mergeDecision(
  latest: { state: ActivityState; endedAt: Date } | null,
  state: ActivityState,
  now: Date,
): { kind: "extend" } | { kind: "new"; startedAt: Date } {
  if (latest && now.getTime() - latest.endedAt.getTime() <= PRESENCE_WINDOW_MS) {
    if (latest.state === state) return { kind: "extend" };
    return { kind: "new", startedAt: latest.endedAt };
  }
  return { kind: "new", startedAt: now };
}

// R5: [start, end) of an org-local calendar date, in UTC instants.
export function dayBounds(date: string): [Date, Date] {
  const start = new Date(toDbDate(date).getTime() - ORG_OFFSET_MS);
  return [start, new Date(start.getTime() + DAY_MS)];
}

type SpanLike = { state: ActivityState; startedAt: Date; endedAt: Date };

// FR-006: clip spans to the day and total them.
export function summarize(spans: SpanLike[], from: Date, to: Date) {
  let activeMs = 0;
  let awayMs = 0;
  let firstActive: Date | null = null;
  let lastActive: Date | null = null;
  const clipped = spans
    .map((s) => ({
      state: s.state,
      startedAt: new Date(Math.max(s.startedAt.getTime(), from.getTime())),
      endedAt: new Date(Math.min(s.endedAt.getTime(), to.getTime())),
    }))
    .filter((s) => s.endedAt.getTime() >= s.startedAt.getTime());
  for (const s of clipped) {
    const ms = s.endedAt.getTime() - s.startedAt.getTime();
    if (s.state === "ACTIVE") {
      activeMs += ms;
      if (!firstActive || s.startedAt < firstActive) firstActive = s.startedAt;
      if (!lastActive || s.endedAt > lastActive) lastActive = s.endedAt;
    } else {
      awayMs += ms;
    }
  }
  return {
    spans: clipped.map((s) => ({
      state: s.state,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt.toISOString(),
      minutes: Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 60_000),
    })),
    summary: {
      activeMinutes: Math.round(activeMs / 60_000),
      awayMinutes: Math.round(awayMs / 60_000),
      firstActiveAt: firstActive?.toISOString() ?? null,
      lastActiveAt: lastActive?.toISOString() ?? null,
    },
  };
}

// --- Heartbeat (US1) ---

export async function heartbeat(orgId: string, state: ActivityState, actor: AccessTokenPayload) {
  const employeeId = requireEmployee(actor);
  const [me, settings] = await Promise.all([getEmployeeSummary(orgId, employeeId), getSettings(orgId)]);
  if (!me || me.status !== "ACTIVE") throw new DomainError("EMPLOYEE_INACTIVE", "Only active employees report activity.", 403);
  if (!settings.enabled) return { recorded: false, presence: null, settings, attendanceState: null };

  // The tracker runs only while checked in and working: nothing is recorded before check-in,
  // after check-out, or during a break. Idle time is recorded as IDLE (never counted as active).
  const attendanceState = await getAttendanceState(employeeId);
  if (attendanceState !== "WORKING") return { recorded: false, presence: null, settings, attendanceState };

  const now = new Date();
  const result = await repo.transaction(async (tx) => {
    const presence = await repo.findPresence(employeeId, tx);
    // R3: throttle — but always record a state change.
    if (presence && presence.state === state && now.getTime() - presence.lastSeenAt.getTime() < THROTTLE_MS) {
      return { recorded: false, presence };
    }
    const latest = presence?.spanId ? await repo.findSpan(tx, presence.spanId) : null;
    const decision = mergeDecision(latest, state, now);
    let spanId: string;
    if (decision.kind === "extend" && latest) {
      spanId = (await repo.extendSpan(tx, latest.id, now)).id;
    } else {
      const startedAt = decision.kind === "new" ? decision.startedAt : now;
      spanId = (await repo.createSpan(tx, { orgId, employeeId, state, startedAt, endedAt: now })).id;
    }
    const updated = await repo.upsertPresence(tx, { orgId, employeeId, state, lastSeenAt: now, spanId });
    return { recorded: true, presence: updated };
  });

  return {
    recorded: result.recorded,
    presence: {
      employeeId,
      employeeName: me.name,
      status: presenceStatus(result.presence, now),
      state: result.presence.state,
      lastSeenAt: result.presence.lastSeenAt.toISOString(),
    },
    settings,
    attendanceState,
  };
}

// --- Scope (FR-005) ---

async function visiblePeople(orgId: string, actor: AccessTokenPayload, includeSelf = true) {
  const active = await listActiveEmployeeSummaries(orgId);
  if (isHr(actor)) return includeSelf ? active : active.filter((e) => e.id !== actor.employeeId);
  const self = requireEmployee(actor);
  if (actor.role === "MANAGER") {
    const reports = new Set(await listDirectReportIds(orgId, self));
    return active.filter((e) => reports.has(e.id) || (includeSelf && e.id === self));
  }
  return includeSelf ? active.filter((e) => e.id === self) : [];
}

async function assertCanView(orgId: string, actor: AccessTokenPayload, employeeId: string) {
  if (isHr(actor) || actor.employeeId === employeeId) return;
  if (actor.role === "MANAGER" && actor.employeeId) {
    const reports = await listDirectReportIds(orgId, actor.employeeId);
    if (reports.includes(employeeId)) return;
    // Offboarded reports drop out of listDirectReportIds; fall back to the record itself.
    const e = await getEmployeeSummary(orgId, employeeId);
    if (e?.managerId === actor.employeeId) return;
  }
  throw new DomainError("FORBIDDEN", "You can't view this person's activity.", 403);
}

// --- Presence (US2) ---

const STATUS_ORDER: Record<PresenceStatus, number> = { ACTIVE: 0, AWAY: 1, OFFLINE: 2 };

export async function listPresence(orgId: string, actor: AccessTokenPayload) {
  const [people, settings] = await Promise.all([visiblePeople(orgId, actor), getSettings(orgId)]);
  const rows = await repo.listPresence(orgId, people.map((p) => p.id));
  const byId = new Map(rows.map((r) => [r.employeeId, r]));
  const now = new Date();
  return people
    .map((p) => {
      const r = byId.get(p.id);
      return {
        employeeId: p.id,
        employeeName: p.name,
        status: presenceStatus(r, now, settings.enabled),
        state: r?.state ?? null,
        lastSeenAt: r?.lastSeenAt.toISOString() ?? null,
      };
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.employeeName.localeCompare(b.employeeName));
}

// --- Timeline & team (US3) ---

export async function getTimeline(orgId: string, actor: AccessTokenPayload, q: { employeeId?: string; date?: string }) {
  const employeeId = q.employeeId ?? requireEmployee(actor);
  await assertCanView(orgId, actor, employeeId);
  const date = q.date ?? localDate(new Date());
  const [from, to] = dayBounds(date);
  const [employee, spans] = await Promise.all([getEmployeeSummary(orgId, employeeId), repo.listSpans(orgId, [employeeId], from, to)]);
  if (!employee) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  return { employeeId, employeeName: employee.name, date, ...summarize(spans, from, to) };
}

export async function teamDay(orgId: string, actor: AccessTokenPayload, q: { date?: string }) {
  const date = q.date ?? localDate(new Date());
  const [from, to] = dayBounds(date);
  const people = await visiblePeople(orgId, actor, false);
  const ids = people.map((p) => p.id);
  const [spans, presence, settings] = await Promise.all([repo.listSpans(orgId, ids, from, to), repo.listPresence(orgId, ids), getSettings(orgId)]);
  const presenceBy = new Map(presence.map((p) => [p.employeeId, p]));
  const now = new Date();
  return people
    .map((p) => {
      const { summary } = summarize(spans.filter((s) => s.employeeId === p.id), from, to);
      const pr = presenceBy.get(p.id);
      return {
        employeeId: p.id,
        employeeName: p.name,
        status: presenceStatus(pr, now, settings.enabled),
        lastSeenAt: pr?.lastSeenAt.toISOString() ?? null,
        ...summary,
      };
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.employeeName.localeCompare(b.employeeName));
}

// --- Retention (FR-011) ---

export async function purgeExpired(now = new Date()) {
  return repo.purgeSpansBefore(new Date(now.getTime() - RETENTION_DAYS * DAY_MS));
}
