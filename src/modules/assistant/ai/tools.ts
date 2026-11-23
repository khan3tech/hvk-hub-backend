// 030 FR-001..FR-005: what the AI may look up and do. Every tool calls another module's own
// service as the asking user, so it can never see or change more than the user can elsewhere.
// Read tools run immediately; action tools only *prepare* a preview — they run after the user
// confirms (chat.ts).
import moment from "moment";
import { z } from "zod";
import type { Anthropic } from "@anthropic-ai/sdk";
import { DomainError } from "../../../middleware/errorHandler.js";
import type { AccessTokenPayload } from "../../../lib/jwt.js";
import {
  checkIn,
  checkOut,
  createLeaveRequest,
  getAttendanceHistory,
  getMyLeaveBalances,
  getMyLeaveRequests,
  listHolidays,
  listLeaveTypes,
} from "../../attendance/service.js";
import { getMyPayslips } from "../../payroll/service.js";
import { myClaims } from "../../expenses/service.js";
import { listCategories, myTickets, raiseTicket } from "../../helpdesk/service.js";
import { listPolicies } from "../../documents/service.js";
import { getEmployeeSummary } from "../../employee/service.js";
import * as time from "../../timetracking/service.js";
import { listArticles } from "../repository.js";
import { articleScore } from "../intents.js";

export type Tool = Anthropic.Beta.Messages.BetaTool;
export interface Ctx {
  orgId: string;
  actor: AccessTokenPayload;
  employeeId: string;
}
export interface Source {
  label: string;
  link: string | null;
}
export interface ReadResult {
  data: unknown;
  sources: Source[];
}
export type ActionKind = "APPLY_LEAVE" | "CHECK_IN" | "CHECK_OUT" | "LOG_TIME" | "START_TIMER" | "STOP_TIMER" | "RAISE_TICKET";
export interface Preview {
  kind: ActionKind;
  title: string;
  fields: { label: string; value: string }[];
}
export interface ActionResult {
  message: string;
  link: string | null;
  data?: unknown;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const empty = z.object({}).strict();
const d = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : null);
const hm = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// JSON schema helper: strict tools need additionalProperties:false and every property required.
function schema(properties: Record<string, unknown>, required: string[] = Object.keys(properties)): Tool["input_schema"] {
  return { type: "object", properties, required, additionalProperties: false } as Tool["input_schema"];
}
const nullable = (type: string, description: string) => ({ type: [type, "null"], description });

// ---------------------------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------------------------

interface ReadTool {
  def: Tool;
  input: z.ZodTypeAny;
  run(ctx: Ctx, input: any): Promise<ReadResult>;
}

const READ_TOOLS: ReadTool[] = [
  {
    def: { name: "get_my_profile", description: "The signed-in employee's own basic profile: name, email, role, manager's name, date of joining.", input_schema: schema({}), strict: true },
    input: empty,
    async run(ctx) {
      const me = await getEmployeeSummary(ctx.orgId, ctx.employeeId);
      const manager = me?.managerId ? await getEmployeeSummary(ctx.orgId, me.managerId) : null;
      return {
        data: { name: me?.name, email: me?.email, role: ctx.actor.role, manager: manager?.name ?? null, dateOfJoining: d(me?.dateOfJoining) },
        sources: [{ label: "My profile", link: "/me" }],
      };
    },
  },
  {
    def: { name: "get_leave_balances", description: "The user's leave balances for the current year per leave type (allocated, used, remaining days) with each leave type's id.", input_schema: schema({}), strict: true },
    input: empty,
    async run(ctx) {
      const [balances, types] = await Promise.all([getMyLeaveBalances(ctx.orgId, ctx.employeeId), listLeaveTypes(ctx.orgId)]);
      const byId = new Map(types.map((t) => [t.id, t]));
      return {
        data: balances.map((b) => ({ leaveTypeId: b.leaveTypeId, leaveType: byId.get(b.leaveTypeId)?.name ?? "Leave", allocated: b.allocated, used: b.used, remaining: b.allocated - b.used, year: b.year })),
        sources: [{ label: "Leave balances", link: "/leave" }],
      };
    },
  },
  {
    def: { name: "list_leave_types", description: "The organization's leave types: id, name, paid or unpaid, default days per year. Use the id when applying leave.", input_schema: schema({}), strict: true },
    input: empty,
    async run(ctx) {
      const types = await listLeaveTypes(ctx.orgId);
      return { data: types.map((t) => ({ id: t.id, name: t.name, paid: t.isPaid, defaultDaysPerYear: t.defaultDays })), sources: [{ label: "Leave types", link: "/leave" }] };
    },
  },
  {
    def: { name: "list_my_leave_requests", description: "The user's most recent leave requests (up to 15) with dates, days and status.", input_schema: schema({}), strict: true },
    input: empty,
    async run(ctx) {
      const [requests, types] = await Promise.all([getMyLeaveRequests(ctx.orgId, ctx.employeeId), listLeaveTypes(ctx.orgId)]);
      const name = new Map(types.map((t) => [t.id, t.name]));
      return {
        data: requests.slice(0, 15).map((r) => ({ leaveType: name.get(r.leaveTypeId) ?? "Leave", startDate: d(r.startDate), endDate: d(r.endDate), days: r.days, status: r.status })),
        sources: [{ label: "My leave requests", link: "/leave" }],
      };
    },
  },
  {
    def: { name: "list_holidays", description: "Upcoming public holidays from today (up to 10).", input_schema: schema({}), strict: true },
    input: empty,
    async run(ctx) {
      const today = moment.utc().startOf("day").toDate();
      const year = moment.utc().year();
      const all = [...(await listHolidays(ctx.orgId, year)), ...(await listHolidays(ctx.orgId, year + 1))];
      return { data: all.filter((h) => h.date >= today).slice(0, 10).map((h) => ({ name: h.name, date: d(h.date) })), sources: [{ label: "Holiday calendar", link: "/holidays" }] };
    },
  },
  {
    def: {
      name: "get_payslips",
      description: "The user's most recent payslips with earnings, deductions, statutory deductions and net pay.",
      input_schema: schema({ count: { type: "integer", description: "How many recent payslips, 1-6." } }),
      strict: true,
    },
    input: z.object({ count: z.number().int().min(1).max(6) }),
    async run(ctx, input: { count: number }) {
      const slips = (await getMyPayslips(ctx.orgId, ctx.employeeId)).slice(0, input.count);
      return {
        data: slips.map((p) => ({
          period: `${MONTHS[p.periodMonth - 1]} ${p.periodYear}`,
          currency: p.currency ?? "INR",
          earnings: p.earnings,
          deductions: p.deductions,
          statutoryDeductions: p.statutoryDeductions,
          netPay: p.netPay,
        })),
        sources: slips.map((p) => ({ label: `Payslip ${MONTHS[p.periodMonth - 1]} ${p.periodYear}`, link: "/payslips" })),
      };
    },
  },
  {
    def: {
      name: "get_attendance",
      description: "The user's attendance (check-in, check-out, status) per day for a date range; default is the last 7 days including today.",
      input_schema: schema({ from: nullable("string", "YYYY-MM-DD or null"), to: nullable("string", "YYYY-MM-DD or null") }),
      strict: true,
    },
    input: z.object({ from: isoDate.nullable(), to: isoDate.nullable() }),
    async run(ctx, input: { from: string | null; to: string | null }) {
      const to = input.to ?? moment.utc().format("YYYY-MM-DD");
      const from = input.from ?? moment.utc(to).subtract(6, "days").format("YYYY-MM-DD");
      if (moment.utc(to).diff(moment.utc(from), "days") > 62) throw new DomainError("INVALID_RANGE", "Ask for at most about two months at a time.", 400);
      const rows = await getAttendanceHistory(ctx.orgId, ctx.employeeId, from, to);
      return { data: rows.map((r) => ({ date: r.date, checkIn: r.checkIn, checkOut: r.checkOut, status: r.status })), sources: [{ label: "Attendance", link: "/attendance" }] };
    },
  },
  {
    def: {
      name: "get_timesheet_week",
      description: "The user's weekly timesheet (Monday-Sunday): status, totals, per-day minutes and every time entry. weekStart may be any date in the week; null means this week.",
      input_schema: schema({ weekStart: nullable("string", "YYYY-MM-DD or null") }),
      strict: true,
    },
    input: z.object({ weekStart: isoDate.nullable() }),
    async run(ctx, input: { weekStart: string | null }) {
      const w = await time.getWeek(ctx.orgId, ctx.actor, { weekStart: input.weekStart ?? undefined });
      return {
        data: {
          weekStart: w.weekStart,
          weekEnd: w.weekEnd,
          status: w.status,
          total: hm(w.totalMinutes),
          billable: hm(w.billableMinutes),
          days: w.days.map((x) => ({ date: x.date, logged: hm(x.minutes) })),
          entries: w.entries.map((e) => ({ date: e.date, project: `${e.projectCode} · ${e.projectName}`, task: e.taskName, duration: hm(e.minutes), billable: e.billable, note: e.note, flagged: e.flagged })),
          rejectionReason: w.status === "REJECTED" ? w.reason : null,
        },
        sources: [{ label: `Timesheet week of ${w.weekStart}`, link: `/time/timesheets?weekStart=${w.weekStart}` }],
      };
    },
  },
  {
    def: { name: "get_running_timer", description: "The user's running time-tracker timer, if any: task, project, start time, elapsed.", input_schema: schema({}), strict: true },
    input: empty,
    async run(ctx) {
      const { timer } = await time.getTimer(ctx.orgId, ctx.actor);
      return {
        data: timer ? { task: timer.taskName, project: timer.projectName, startedAt: timer.startedAt, elapsed: hm(Math.floor(timer.elapsedSeconds / 60)), note: timer.note } : { running: false },
        sources: [{ label: "Timer", link: "/time/timesheets" }],
      };
    },
  },
  {
    def: { name: "list_time_projects", description: "Active time-tracking projects the user can log time to, with their tasks and ids. Use task ids for logging time or starting a timer.", input_schema: schema({}), strict: true },
    input: empty,
    async run(ctx) {
      const projects = await time.listProjects(ctx.orgId, ctx.actor, { mine: true });
      const details = await Promise.all(projects.map((p) => time.getProject(ctx.orgId, p.id, ctx.actor)));
      return {
        data: details.map((p) => ({ projectId: p.id, code: p.code, name: p.name, client: p.clientName, billable: p.billable, tasks: p.tasks.filter((t) => t.status === "ACTIVE").map((t) => ({ taskId: t.id, name: t.name })) })),
        sources: [{ label: "My projects", link: "/time/projects" }],
      };
    },
  },
  {
    def: { name: "list_expense_claims", description: "The user's recent expense claims with amount, category, status and any rejection reason.", input_schema: schema({}), strict: true },
    input: empty,
    async run(ctx) {
      const claims = await myClaims(ctx.orgId, ctx.actor);
      return { data: claims.slice(0, 10).map((c) => ({ category: c.category, amount: c.amount, date: d(c.createdAt), status: c.status, rejectionReason: c.rejectionReason ?? null })), sources: [{ label: "My expenses", link: "/expenses" }] };
    },
  },
  {
    def: { name: "list_helpdesk_tickets", description: "The user's own HR helpdesk tickets with subject, category and status.", input_schema: schema({}), strict: true },
    input: empty,
    async run(ctx) {
      const tickets = await myTickets(ctx.orgId, ctx.actor);
      return { data: tickets.slice(0, 10).map((t) => ({ subject: t.subject, category: t.category, status: t.status, raised: d(t.createdAt) })), sources: [{ label: "My tickets", link: "/helpdesk" }] };
    },
  },
  {
    def: { name: "list_helpdesk_categories", description: "Helpdesk ticket categories with ids (needed to raise a ticket).", input_schema: schema({}), strict: true },
    input: empty,
    async run(ctx) {
      const cats = await listCategories(ctx.orgId);
      return { data: cats.map((c) => ({ id: c.id, name: c.name })), sources: [] };
    },
  },
  {
    def: {
      name: "search_policies",
      description: "Search HR's knowledge articles and published company policies. Quote what the articles say; do not add policy details that aren't in them.",
      input_schema: schema({ query: { type: "string", description: "What the user wants to know, in a few words." } }),
      strict: true,
    },
    input: z.object({ query: z.string().min(1).max(300) }),
    async run(ctx, input: { query: string }) {
      const [articles, policies] = await Promise.all([listArticles(ctx.orgId), listPolicies(ctx.orgId, ctx.actor)]);
      const ranked = articles
        .map((a) => ({ a, score: articleScore(input.query, { title: a.title, keywords: (a.keywords as string[]) ?? [] }) }))
        .filter((x) => x.score > 0)
        .sort((x, y) => y.score - x.score)
        .slice(0, 3)
        .map((x) => x.a);
      return {
        data: {
          articles: ranked.map((a) => ({ title: a.title, body: a.body })),
          publishedPolicies: policies.filter((p) => p.documentId).map((p) => ({ title: p.title })),
          note: ranked.length ? undefined : "No matching HR article. Say you don't have an answer and suggest raising a helpdesk ticket.",
        },
        sources: ranked.map((a) => ({ label: a.title, link: "/policies" })),
      };
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Action tools — prepare (validate + preview) now, execute after confirmation
// ---------------------------------------------------------------------------------------------

interface ActionTool {
  kind: ActionKind;
  def: Tool;
  input: z.ZodTypeAny;
  prepare(ctx: Ctx, input: any): Promise<Preview>;
  execute(ctx: Ctx, input: any): Promise<ActionResult>;
}

async function taskLabel(ctx: Ctx, taskId: string) {
  const t = await time.describeTask(ctx.orgId, taskId, ctx.employeeId);
  if (!t) throw new DomainError("NOT_FOUND", "That task doesn't exist. Use list_time_projects to find task ids.", 404);
  if (!t.isMember) throw new DomainError("NOT_A_MEMBER", "The user isn't a member of that project.", 403);
  if (!t.active) throw new DomainError("PROJECT_ARCHIVED", "That project or task is archived.", 409);
  return t;
}

const ACTION_TOOLS: ActionTool[] = [
  {
    kind: "APPLY_LEAVE",
    def: {
      name: "apply_leave",
      description: "Propose a leave request for the user. Shows the user a confirmation card; it is submitted only if they confirm. Get leaveTypeId from list_leave_types.",
      input_schema: schema({ leaveTypeId: { type: "string" }, startDate: { type: "string", description: "YYYY-MM-DD" }, endDate: { type: "string", description: "YYYY-MM-DD" } }),
      strict: true,
    },
    input: z.object({ leaveTypeId: z.string(), startDate: isoDate, endDate: isoDate }),
    async prepare(ctx, input: { leaveTypeId: string; startDate: string; endDate: string }) {
      const type = (await listLeaveTypes(ctx.orgId)).find((t) => t.id === input.leaveTypeId);
      if (!type) throw new DomainError("NOT_FOUND", "Unknown leave type. Use list_leave_types.", 404);
      if (input.endDate < input.startDate) throw new DomainError("VALIDATION_ERROR", "The end date is before the start date.", 400);
      const days = moment.utc(input.endDate).diff(moment.utc(input.startDate), "days") + 1;
      return {
        kind: "APPLY_LEAVE",
        title: "Apply leave",
        fields: [
          { label: "Leave type", value: `${type.name} (${type.isPaid ? "paid" : "unpaid"})` },
          { label: "From", value: moment.utc(input.startDate).format("ddd, D MMM YYYY") },
          { label: "To", value: moment.utc(input.endDate).format("ddd, D MMM YYYY") },
          { label: "Calendar days", value: String(days) },
        ],
      };
    },
    async execute(ctx, input: { leaveTypeId: string; startDate: string; endDate: string }) {
      const r = await createLeaveRequest(ctx.orgId, ctx.employeeId, { leaveTypeId: input.leaveTypeId, startDate: input.startDate, endDate: input.endDate }, ctx.actor);
      return { message: `Leave request submitted for ${r.days} day(s); status ${String(r.status).toLowerCase()}.`, link: "/leave", data: { days: r.days, status: r.status } };
    },
  },
  {
    kind: "CHECK_IN",
    def: { name: "check_in", description: "Propose checking the user in for today (attendance). Requires confirmation.", input_schema: schema({}), strict: true },
    input: empty,
    async prepare() {
      return { kind: "CHECK_IN", title: "Check in", fields: [{ label: "When", value: "Now" }] };
    },
    async execute(ctx) {
      await checkIn(ctx.orgId, ctx.employeeId);
      return { message: "Checked in.", link: "/attendance" };
    },
  },
  {
    kind: "CHECK_OUT",
    def: { name: "check_out", description: "Propose checking the user out for today (attendance). Requires confirmation.", input_schema: schema({}), strict: true },
    input: empty,
    async prepare() {
      return { kind: "CHECK_OUT", title: "Check out", fields: [{ label: "When", value: "Now" }] };
    },
    async execute(ctx) {
      await checkOut(ctx.orgId, ctx.employeeId);
      return { message: "Checked out.", link: "/attendance" };
    },
  },
  {
    kind: "LOG_TIME",
    def: {
      name: "log_time",
      description: "Propose a time entry on a task. Get taskId from list_time_projects. billable null means the project's default.",
      input_schema: schema({
        taskId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        minutes: { type: "integer", description: "Duration in minutes, 1-1440" },
        note: nullable("string", "Optional note"),
        billable: nullable("boolean", "Billable override or null"),
      }),
      strict: true,
    },
    input: z.object({ taskId: z.string(), date: isoDate, minutes: z.number().int().min(1).max(1440), note: z.string().max(1000).nullable(), billable: z.boolean().nullable() }),
    async prepare(ctx, input: { taskId: string; date: string; minutes: number; note: string | null; billable: boolean | null }) {
      const t = await taskLabel(ctx, input.taskId);
      return {
        kind: "LOG_TIME",
        title: "Log time",
        fields: [
          { label: "Project", value: `${t.projectCode} · ${t.projectName}` },
          { label: "Task", value: t.taskName },
          { label: "Date", value: moment.utc(input.date).format("ddd, D MMM YYYY") },
          { label: "Duration", value: hm(input.minutes) },
          { label: "Billable", value: (input.billable ?? t.billable) ? "Yes" : "No" },
          ...(input.note ? [{ label: "Note", value: input.note }] : []),
        ],
      };
    },
    async execute(ctx, input: { taskId: string; date: string; minutes: number; note: string | null; billable: boolean | null }) {
      const e = await time.createEntry(ctx.orgId, { taskId: input.taskId, date: input.date, minutes: input.minutes, note: input.note ?? undefined, billable: input.billable ?? undefined }, ctx.actor);
      return { message: `Logged ${hm(e.minutes)} on ${e.taskName} for ${e.date}.`, link: `/time/timesheets?weekStart=${e.date}` };
    },
  },
  {
    kind: "START_TIMER",
    def: {
      name: "start_timer",
      description: "Propose starting the time-tracker timer on a task. If a timer is already running, set switchFromRunning true to stop and save it first.",
      input_schema: schema({ taskId: { type: "string" }, note: nullable("string", "Optional note"), switchFromRunning: { type: "boolean" } }),
      strict: true,
    },
    input: z.object({ taskId: z.string(), note: z.string().max(1000).nullable(), switchFromRunning: z.boolean() }),
    async prepare(ctx, input: { taskId: string; note: string | null; switchFromRunning: boolean }) {
      const t = await taskLabel(ctx, input.taskId);
      const { timer } = await time.getTimer(ctx.orgId, ctx.actor);
      if (timer && !input.switchFromRunning) throw new DomainError("TIMER_ALREADY_RUNNING", `A timer is already running on ${timer.taskName}. Ask whether to switch.`, 409);
      return {
        kind: "START_TIMER",
        title: timer ? "Switch timer" : "Start timer",
        fields: [
          ...(timer ? [{ label: "Stops and saves", value: `${timer.taskName} (${hm(Math.floor(timer.elapsedSeconds / 60))} so far)` }] : []),
          { label: "Project", value: `${t.projectCode} · ${t.projectName}` },
          { label: "Task", value: t.taskName },
          ...(input.note ? [{ label: "Note", value: input.note }] : []),
        ],
      };
    },
    async execute(ctx, input: { taskId: string; note: string | null; switchFromRunning: boolean }) {
      const r = await time.startTimer(ctx.orgId, { taskId: input.taskId, note: input.note ?? undefined, switch: input.switchFromRunning }, ctx.actor);
      return {
        message: `Timer started on ${r.timer.taskName}.${r.stoppedEntry ? ` Saved ${hm(r.stoppedEntry.minutes)} on ${r.stoppedEntry.taskName}.` : ""}`,
        link: "/time/timesheets",
      };
    },
  },
  {
    kind: "STOP_TIMER",
    def: { name: "stop_timer", description: "Propose stopping the running timer and saving it as a time entry.", input_schema: schema({ note: nullable("string", "Optional note") }), strict: true },
    input: z.object({ note: z.string().max(1000).nullable() }),
    async prepare(ctx, input: { note: string | null }) {
      const { timer } = await time.getTimer(ctx.orgId, ctx.actor);
      if (!timer) throw new DomainError("NO_TIMER", "No timer is running.", 404);
      return {
        kind: "STOP_TIMER",
        title: "Stop timer",
        fields: [
          { label: "Task", value: `${timer.taskName} · ${timer.projectName}` },
          { label: "Running for", value: hm(Math.floor(timer.elapsedSeconds / 60)) },
          ...(input.note ? [{ label: "Note", value: input.note }] : []),
        ],
      };
    },
    async execute(ctx, input: { note: string | null }) {
      const { entry } = await time.stopTimer(ctx.orgId, { note: input.note ?? undefined }, ctx.actor);
      return { message: `Timer stopped: ${hm(entry.minutes)} saved on ${entry.taskName}${entry.flagged ? " (flagged for review)" : ""}.`, link: `/time/timesheets?weekStart=${entry.date}` };
    },
  },
  {
    kind: "RAISE_TICKET",
    def: {
      name: "raise_ticket",
      description: "Propose raising an HR helpdesk ticket. Get categoryId from list_helpdesk_categories. Write a clear subject and description from what the user said.",
      input_schema: schema({ categoryId: { type: "string" }, subject: { type: "string", description: "3-150 characters" }, description: { type: "string", description: "3-5000 characters" } }),
      strict: true,
    },
    input: z.object({ categoryId: z.string(), subject: z.string().trim().min(3).max(150), description: z.string().trim().min(3).max(5000) }),
    async prepare(ctx, input: { categoryId: string; subject: string; description: string }) {
      const cat = (await listCategories(ctx.orgId)).find((c) => c.id === input.categoryId);
      if (!cat) throw new DomainError("NOT_FOUND", "Unknown category. Use list_helpdesk_categories.", 404);
      return {
        kind: "RAISE_TICKET",
        title: "Raise helpdesk ticket",
        fields: [
          { label: "Category", value: cat.name },
          { label: "Subject", value: input.subject },
          { label: "Description", value: input.description },
        ],
      };
    },
    async execute(ctx, input: { categoryId: string; subject: string; description: string }) {
      const t = await raiseTicket(ctx.orgId, input, ctx.actor);
      return { message: `Ticket raised: "${t.subject}".`, link: "/helpdesk" };
    },
  },
];

const readByName = new Map(READ_TOOLS.map((t) => [t.def.name, t]));
const actionByName = new Map(ACTION_TOOLS.map((t) => [t.def.name, t]));

export const TOOL_DEFS: Tool[] = [...READ_TOOLS.map((t) => t.def), ...ACTION_TOOLS.map((t) => t.def)];
export const isAction = (name: string) => actionByName.has(name);

function parse(tool: { input: z.ZodTypeAny }, raw: unknown) {
  const r = tool.input.safeParse(raw ?? {});
  if (!r.success) throw new DomainError("INVALID_INPUT", `Invalid input: ${r.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}`, 400);
  return r.data;
}

export async function runRead(ctx: Ctx, name: string, raw: unknown): Promise<ReadResult> {
  const tool = readByName.get(name);
  if (!tool) throw new DomainError("UNKNOWN_TOOL", `Unknown tool ${name}.`, 400);
  return tool.run(ctx, parse(tool, raw));
}

export async function prepareAction(ctx: Ctx, name: string, raw: unknown): Promise<{ preview: Preview; input: unknown }> {
  const tool = actionByName.get(name)!;
  const input = parse(tool, raw);
  return { preview: await tool.prepare(ctx, input), input };
}

export async function executeAction(ctx: Ctx, name: string, input: unknown): Promise<ActionResult> {
  const tool = actionByName.get(name);
  if (!tool) throw new DomainError("UNKNOWN_TOOL", `Unknown tool ${name}.`, 400);
  // Re-validate: the stored input is replayed from the database.
  return tool.execute(ctx, parse(tool, input));
}
