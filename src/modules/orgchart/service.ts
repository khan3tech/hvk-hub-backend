// Read-only org chart over 002's live reporting lines (specs/016-org-chart-visualization).
// No stored copy (FR-009): every call rebuilds from current active employees.
import { DomainError } from "../../middleware/errorHandler.js";
import { getEmployeeSummary, listActiveEmployeeSummaries, listDepartments, listDesignations } from "../employee/service.js";
import { getTopEmployeeId, setTopEmployeeId } from "../organizations/service.js";
import { buildForest, pathTo, type Forest } from "./compute.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";

export const DEFAULT_DEPTH = 2;
export const MAX_DEPTH = 6;

type Person = Awaited<ReturnType<typeof listActiveEmployeeSummaries>>[number];

const isPrivileged = (actor: AccessTokenPayload) => actor.role === "HR" || actor.role === "ADMIN";

// 024: employees holding a critical position, shown to HR/Admin only. Registered in app.ts.
type CriticalPositions = (orgId: string) => Promise<Set<string>>;
let criticalPositions: CriticalPositions = async () => new Set();
export function setCriticalPositionsProvider(fn: CriticalPositions): void {
  criticalPositions = fn;
}

async function load(orgId: string, actor?: AccessTokenPayload) {
  const [people, departments, designations, topId, critical] = await Promise.all([
    listActiveEmployeeSummaries(orgId), // FR-005: offboarded excluded
    listDepartments(orgId),
    listDesignations(orgId),
    getTopEmployeeId(orgId),
    actor && isPrivileged(actor) ? criticalPositions(orgId) : Promise.resolve(new Set<string>()),
  ]);
  return {
    forest: buildForest<Person>(people, (p) => p.name.toLowerCase()),
    dept: new Map(departments.map((d) => [d.id, d])),
    title: new Map(designations.map((d) => [d.id, d.title])),
    topId,
    critical,
  };
}

type Ctx = Awaited<ReturnType<typeof load>>;

// FR-003: everyone sees directory-level fields (name, title, department). Email only for
// HR/Admin, the person themself, or their manager — and never anything like salary.
function node(ctx: Ctx, p: Person, actor: AccessTokenPayload) {
  const reports = ctx.forest.children.get(p.id) ?? [];
  const canSeeContact = isPrivileged(actor) || actor.employeeId === p.id || actor.employeeId === p.managerId;
  const managerActive = p.managerId ? ctx.forest.byId.has(p.managerId) : false;
  return {
    id: p.id,
    name: p.name,
    title: p.designationId ? ctx.title.get(p.designationId) ?? null : null,
    department: p.departmentId ? ctx.dept.get(p.departmentId)?.name ?? null : null,
    managerId: managerActive ? p.managerId : null,
    directReportCount: reports.length,
    hasChildren: reports.length > 0, // a leaf gets no expand control (edge case)
    isMe: actor.employeeId === p.id,
    ...(canSeeContact ? { email: p.email } : {}),
    // FR-008: HR/Admin-only overlay
    ...(isPrivileged(actor) ? { orphan: !managerActive && p.id !== ctx.topId, criticalPosition: ctx.critical.has(p.id) } : {}),
  };
}

type ChartNode = ReturnType<typeof node> & { children?: ChartNode[] };

function subtree(ctx: Ctx, p: Person, actor: AccessTokenPayload, depth: number): ChartNode {
  const n: ChartNode = node(ctx, p, actor);
  if (depth > 0 && n.hasChildren) {
    n.children = (ctx.forest.children.get(p.id) ?? []).map((c) => subtree(ctx, c, actor, depth - 1));
  }
  return n;
}

// FR-001/FR-006: roots (designated top first) expanded to a shallow depth; the rest lazily.
export async function getChart(orgId: string, actor: AccessTokenPayload, depth = DEFAULT_DEPTH) {
  const ctx = await load(orgId, actor);
  const d = Math.min(Math.max(depth, 0), MAX_DEPTH);
  const roots = [...ctx.forest.roots].sort((a, b) => Number(b.id === ctx.topId) - Number(a.id === ctx.topId));
  return {
    totalEmployees: ctx.forest.byId.size,
    depth: d,
    roots: roots.map((r) => subtree(ctx, r, actor, d)),
    // US1.4: where the caller sits, so the client can expand and centre on it.
    myPath: actor.employeeId ? pathTo(ctx.forest, actor.employeeId) : null,
    ...(isPrivileged(actor) && ctx.forest.cycles.length ? { cycleCount: ctx.forest.cycles.length } : {}),
  };
}

// FR-002: expand one branch.
export async function getChildren(orgId: string, employeeId: string, actor: AccessTokenPayload, depth = 0) {
  const ctx = await load(orgId, actor);
  const p = ctx.forest.byId.get(employeeId);
  if (!p) throw new DomainError("NOT_FOUND", "Employee not found on the org chart.", 404);
  return (ctx.forest.children.get(employeeId) ?? []).map((c) => subtree(ctx, c, actor, Math.min(depth, MAX_DEPTH)));
}

// FR-004: name search with the ancestor path to auto-expand. Empty array = "no results".
export async function search(orgId: string, q: string, actor: AccessTokenPayload, limit = 20) {
  const term = q.trim().toLowerCase();
  if (term.length < 1) return [];
  const ctx = await load(orgId, actor);
  return [...ctx.forest.byId.values()]
    .filter((p) => p.name.toLowerCase().includes(term))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(term)) - Number(!b.name.toLowerCase().startsWith(term)) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((p) => ({ ...node(ctx, p, actor), path: pathTo(ctx.forest, p.id), inCycle: pathTo(ctx.forest, p.id) === null }));
}

// FR-007/FR-008/SC-004: every orphan, headless department and cycle, in one view.
export async function structuralGaps(orgId: string) {
  const ctx = await load(orgId);
  const name = (id: string) => ctx.forest.byId.get(id)?.name ?? id;
  const orphans = ctx.forest.roots
    .filter((p) => p.id !== ctx.topId)
    .map((p) => ({ id: p.id, name: p.name, reason: p.managerId ? "MANAGER_OFFBOARDED_OR_MISSING" : "NO_MANAGER" }));
  const headlessDepartments = [...ctx.dept.values()]
    .filter((d) => !d.headEmployeeId || !ctx.forest.byId.has(d.headEmployeeId))
    .map((d) => ({ id: d.id, name: d.name, reason: d.headEmployeeId ? "HEAD_OFFBOARDED" : "NO_HEAD" }));
  return {
    topEmployee: ctx.topId && ctx.forest.byId.has(ctx.topId) ? { id: ctx.topId, name: name(ctx.topId) } : null,
    orphans,
    headlessDepartments,
    cycles: ctx.forest.cycles.map((c) => c.map((id) => ({ id, name: name(id) }))),
  };
}

// HR/Admin designate the company's top position (so it isn't flagged as an orphan).
export async function setTop(orgId: string, employeeId: string | null) {
  if (employeeId) {
    const e = await getEmployeeSummary(orgId, employeeId);
    if (!e || e.status !== "ACTIVE") {
      throw new DomainError("VALIDATION_ERROR", "The top position must be an active employee.", 400, { employeeId: ["Not an active employee."] });
    }
  }
  await setTopEmployeeId(orgId, employeeId);
  return structuralGaps(orgId);
}

export type { Forest };
