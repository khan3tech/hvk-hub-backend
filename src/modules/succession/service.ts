// Succession planning (specs/024-succession-planning). HR/Admin only (FR-010).
import type { ReadinessLevel } from "@prisma/client";
import { DomainError } from "../../middleware/errorHandler.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";

type Plan = NonNullable<Awaited<ReturnType<typeof repo.findPlanByPosition>>>;
export type Risk = "NO_COVERAGE" | "NOT_READY" | "READY_NOW";
export const OFFBOARDED_REASON = "Offboarded";
const isHr = (actor?: AccessTokenPayload) => actor?.role === "HR" || actor?.role === "ADMIN";

async function audit(orgId: string, actor: AccessTokenPayload, action: string, entity: string, entityId: string, after?: unknown) {
  if (actor.employeeId) await repo.writeActivityLog({ orgId, actorId: actor.employeeId, action, entity, entityId, after });
}

const personOf = (p: Plan["positionEmployee"]) => ({
  id: p.id, name: p.name, departmentId: p.departmentId, department: p.department?.name ?? null, active: p.status === "ACTIVE",
});

// FR-007: no viable successor → highest risk; any viable ready-now successor → lowest.
export function riskOf(candidates: Array<{ isValid: boolean; readinessLevel: ReadinessLevel }>): Risk {
  const viable = candidates.filter((c) => c.isValid);
  if (viable.length === 0) return "NO_COVERAGE";
  return viable.some((c) => c.readinessLevel === "READY_NOW") ? "READY_NOW" : "NOT_READY";
}

function present(plan: Plan) {
  return {
    id: plan.id,
    position: { ...personOf(plan.positionEmployee), vacant: plan.positionEmployee.status !== "ACTIVE" }, // FR-006
    isCritical: plan.isCritical,
    markedAt: plan.markedAt,
    unmarkedAt: plan.unmarkedAt,
    risk: riskOf(plan.candidates),
    successors: plan.candidates.map((c) => ({
      id: c.id,
      employee: personOf(c.candidateEmployee),
      readinessLevel: c.readinessLevel,
      isValid: c.isValid,
      invalidReason: c.invalidReason,
      invalidatedAt: c.invalidatedAt,
      history: c.readinessChanges.map((h) => ({ fromLevel: h.fromLevel, toLevel: h.toLevel, note: h.note, changedById: h.changedById, changedAt: h.changedAt })),
    })),
  };
}

async function requirePlan(orgId: string, positionEmployeeId: string) {
  const plan = await repo.findPlanByPosition(orgId, positionEmployeeId);
  if (!plan) throw new DomainError("NOT_FOUND", "This position has no succession plan.", 404);
  return plan;
}

// --- Critical positions (FR-001) ---

export async function markCritical(orgId: string, employeeId: string, actor: AccessTokenPayload) {
  const employee = await repo.findEmployee(orgId, employeeId);
  if (!employee) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  if (employee.status !== "ACTIVE") throw new DomainError("INVALID_STATE", "Only an active employee's position can be marked critical.", 409);
  await repo.upsertPlan(orgId, employeeId, actor.employeeId);
  await audit(orgId, actor, "succession.marked_critical", "Employee", employeeId);
  return present(await requirePlan(orgId, employeeId));
}

// The plan and its successors stay on record (FR-006); marking again picks them back up.
export async function unmarkCritical(orgId: string, employeeId: string, actor: AccessTokenPayload) {
  const plan = await requirePlan(orgId, employeeId);
  const { count } = await repo.unmarkPlan(plan.id);
  if (count === 0) throw new DomainError("INVALID_STATE", "This position isn't marked critical.", 409);
  await audit(orgId, actor, "succession.unmarked_critical", "Employee", employeeId);
  return present(await requirePlan(orgId, employeeId));
}

export async function getPlan(orgId: string, positionEmployeeId: string) {
  return present(await requirePlan(orgId, positionEmployeeId));
}

// --- Successors (FR-002–FR-005) ---

export async function addSuccessor(orgId: string, positionEmployeeId: string, input: { employeeId: string; readinessLevel: ReadinessLevel; note?: string }, actor: AccessTokenPayload) {
  const plan = await requirePlan(orgId, positionEmployeeId);
  if (!plan.isCritical) throw new DomainError("INVALID_STATE", "Mark the position critical before adding successors.", 409);
  if (input.employeeId === positionEmployeeId) throw new DomainError("VALIDATION_ERROR", "The position holder can't be their own successor.", 400);
  // FR-003: internal, currently active employees only.
  const candidate = await repo.findEmployee(orgId, input.employeeId);
  if (!candidate || candidate.status !== "ACTIVE") {
    throw new DomainError("SUCCESSOR_NOT_ACTIVE", "Successors must be active employees of this organization.", 400);
  }
  const existing = await repo.findCandidateOnPlan(plan.id, input.employeeId);
  if (existing?.isValid) throw new DomainError("SUCCESSOR_EXISTS", "This employee is already a successor for this position.", 409);
  const note = input.note ?? null;
  const row = existing
    ? await repo.reinstateCandidate(existing.id, orgId, input.readinessLevel, existing.readinessLevel, actor.employeeId, note)
    : await repo.addCandidate({ orgId, successionPlanId: plan.id, candidateEmployeeId: input.employeeId, readinessLevel: input.readinessLevel, addedById: actor.employeeId, note });
  await audit(orgId, actor, "succession.successor_added", "SuccessionCandidate", row.id, { positionEmployeeId, employeeId: input.employeeId, readinessLevel: input.readinessLevel });
  return present(await requirePlan(orgId, positionEmployeeId));
}

async function requireCandidate(orgId: string, id: string) {
  const c = await repo.findCandidate(orgId, id);
  if (!c) throw new DomainError("NOT_FOUND", "Successor not found.", 404);
  return c;
}

export async function updateReadiness(orgId: string, id: string, input: { readinessLevel: ReadinessLevel; note?: string }, actor: AccessTokenPayload) {
  const c = await requireCandidate(orgId, id);
  if (!c.isValid) throw new DomainError("INVALID_STATE", "This successor is no longer valid on the plan.", 409);
  if (c.readinessLevel !== input.readinessLevel || input.note) {
    await repo.changeReadiness(id, orgId, c.readinessLevel, input.readinessLevel, actor.employeeId, input.note ?? null);
    await audit(orgId, actor, "succession.readiness_changed", "SuccessionCandidate", id, { from: c.readinessLevel, to: input.readinessLevel });
  }
  return present(await requirePlan(orgId, c.successionPlan.positionEmployeeId));
}

// Removal keeps the entry (and history) as not valid rather than deleting it.
export async function removeSuccessor(orgId: string, id: string, actor: AccessTokenPayload) {
  const c = await requireCandidate(orgId, id);
  const { count } = await repo.invalidateCandidate(id, "Removed by HR");
  if (count === 0) throw new DomainError("INVALID_STATE", "This successor is already off the plan.", 409);
  await audit(orgId, actor, "succession.successor_removed", "SuccessionCandidate", id);
  return present(await requirePlan(orgId, c.successionPlan.positionEmployeeId));
}

// Registered with employee/service.onEmployeeOffboarded() in app.ts. FR-005, SC-003.
export async function onEmployeeOffboarded(orgId: string, employeeId: string) {
  await repo.invalidateCandidacies(orgId, employeeId, OFFBOARDED_REASON);
}

// --- Overview (FR-007–FR-009, SC-002) ---

export async function overview(orgId: string, filters: { departmentId?: string } = {}) {
  const plans = (await repo.listCriticalPlans(orgId, filters.departmentId ? { positionEmployee: { departmentId: filters.departmentId } } : {})).map(present);
  // FR-009: across every critical plan (not only the filtered ones), who covers more than one.
  const all = filters.departmentId ? (await repo.listCriticalPlans(orgId)).map(present) : plans;
  const covering = new Map<string, { employee: ReturnType<typeof personOf>; positions: Array<{ id: string; name: string }> }>();
  for (const plan of all) {
    for (const s of plan.successors.filter((x) => x.isValid)) {
      const entry = covering.get(s.employee.id) ?? { employee: s.employee, positions: [] };
      entry.positions.push({ id: plan.position.id, name: plan.position.name });
      covering.set(s.employee.id, entry);
    }
  }
  const summarize = (p: (typeof plans)[number]) => ({
    planId: p.id,
    position: p.position,
    risk: p.risk,
    validSuccessors: p.successors.filter((s) => s.isValid).length,
    readyNow: p.successors.filter((s) => s.isValid && s.readinessLevel === "READY_NOW").length,
  });
  return {
    totals: { critical: plans.length, NO_COVERAGE: plans.filter((p) => p.risk === "NO_COVERAGE").length, NOT_READY: plans.filter((p) => p.risk === "NOT_READY").length, READY_NOW: plans.filter((p) => p.risk === "READY_NOW").length },
    // Highest risk first (US3.1/US3.2).
    groups: {
      NO_COVERAGE: plans.filter((p) => p.risk === "NO_COVERAGE").map(summarize),
      NOT_READY: plans.filter((p) => p.risk === "NOT_READY").map(summarize),
      READY_NOW: plans.filter((p) => p.risk === "READY_NOW").map(summarize),
    },
    multiPositionSuccessors: [...covering.values()].filter((c) => c.positions.length > 1),
  };
}

// --- Hooks for 002 (profile) and 016 (org chart): HR/Admin only (FR-010, SC-004) ---

export async function employeeDecoration(orgId: string, employeeIds: string[], requester?: AccessTokenPayload) {
  const out = new Map<string, Record<string, unknown>>();
  if (!isHr(requester)) return out;
  const critical = await repo.criticalPositionIds(orgId, employeeIds);
  for (const id of employeeIds) out.set(id, { criticalPosition: critical.has(id) });
  return out;
}

export function criticalPositions(orgId: string) {
  return repo.criticalPositionIds(orgId);
}
