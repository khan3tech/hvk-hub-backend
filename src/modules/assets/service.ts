// Business rules for the asset inventory. Framework-agnostic — no req/res.
// Implements specs/014-asset-expense-management/spec.md (User Stories 1-2).
import { Prisma } from "@prisma/client";
import { DomainError } from "../../middleware/errorHandler.js";
import { getEmployeeSummary } from "../employee/service.js";
import { completeSystemTask as completeOnboardingTask } from "../onboarding/service.js";
import { completeSystemTask as completeExitTask } from "../exit/service.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";

type AssetRow = NonNullable<Awaited<ReturnType<typeof repo.findAsset>>>;

const isPrivileged = (actor: AccessTokenPayload) => actor.role === "HR" || actor.role === "ADMIN";

function present(asset: AssetRow) {
  const { assignments, ...rest } = asset;
  const open = assignments[0];
  return { ...rest, assignedTo: open ? { employeeId: open.employeeId, assignedAt: open.assignedAt } : null };
}

async function audit(orgId: string, actor: AccessTokenPayload, action: string, entityId: string, after?: unknown) {
  if (!actor.employeeId) return;
  await repo.writeActivityLog({ orgId, actorId: actor.employeeId, action, entity: "Asset", entityId, after });
}

async function requireAsset(orgId: string, id: string) {
  const asset = await repo.findAsset(orgId, id);
  if (!asset) throw new DomainError("NOT_FOUND", "Asset not found.", 404);
  return asset;
}

// FR-001
export async function createAsset(orgId: string, input: { description: string; identifier: string }, actor: AccessTokenPayload) {
  try {
    const asset = await repo.createAsset({ orgId, description: input.description, identifier: input.identifier });
    await audit(orgId, actor, "asset.created", asset.id, input);
    return present(asset);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DomainError("IDENTIFIER_TAKEN", "Another asset already uses this identifier.", 409);
    }
    throw err;
  }
}

export async function listAssets(orgId: string, status?: string) {
  const where = status ? { status: status as Prisma.EnumAssetStatusFilter["equals"] } : {};
  return (await repo.listAssets(orgId, where)).map(present);
}

export async function getAsset(orgId: string, id: string) {
  const asset = await requireAsset(orgId, id);
  return { ...present(asset), history: await repo.assignmentHistory(orgId, id) };
}

// FR-002/SC-004 + FR-005: assigning completes an open onboarding asset task for that employee.
export async function assignAsset(orgId: string, assetId: string, employeeId: string, actor: AccessTokenPayload) {
  const asset = await requireAsset(orgId, assetId);
  const employee = await getEmployeeSummary(orgId, employeeId);
  if (!employee || employee.status !== "ACTIVE") {
    throw new DomainError("VALIDATION_ERROR", "Assets can only be assigned to active employees.", 400, { employeeId: ["Not an active employee."] });
  }
  const assignment = await repo.assignAsset(orgId, assetId, employeeId, actor.employeeId);
  if (!assignment) {
    throw new DomainError(
      "ASSET_UNAVAILABLE",
      asset.status === "ASSIGNED" ? "This asset is already assigned. Return it before reassigning." : `This asset is ${asset.status.toLowerCase()} and can't be assigned.`,
      409,
    );
  }
  await audit(orgId, actor, "asset.assigned", assetId, { employeeId });
  await completeOnboardingTask(orgId, employeeId, "ASSET_ASSIGNMENT", actor);
  return present(await requireAsset(orgId, assetId));
}

// FR-006: once an employee holds no assets, their exit checklist's asset task completes.
async function afterRelease(orgId: string, employeeId: string, actor: AccessTokenPayload) {
  const remaining = await repo.openAssignmentsFor(orgId, [employeeId]);
  if (remaining.length === 0) await completeExitTask(orgId, employeeId, "ASSET_RETURN", actor);
}

// FR-003: return → unassigned again.
export async function returnAsset(orgId: string, assetId: string, actor: AccessTokenPayload) {
  await requireAsset(orgId, assetId);
  const closed = await repo.closeAssignment(assetId, ["ASSIGNED"], "UNASSIGNED", "RETURNED", actor.employeeId);
  if (closed === null) throw new DomainError("INVALID_STATE", "Only an assigned asset can be returned.", 409);
  await audit(orgId, actor, "asset.returned", assetId, { employeeId: closed.employeeId });
  await afterRelease(orgId, closed.employeeId, actor);
  return present(await requireAsset(orgId, assetId));
}

// FR-003 edge case: lost/damaged leaves the assignable pool; it also ends any assignment.
export async function markAsset(orgId: string, assetId: string, status: "LOST" | "DAMAGED", actor: AccessTokenPayload) {
  const asset = await requireAsset(orgId, assetId);
  if (asset.status === status) return present(asset);
  // Any status may become lost/damaged; `closed` is the assignment it ended, if one was open.
  const closed = await repo.closeAssignment(assetId, ["UNASSIGNED", "ASSIGNED", "LOST", "DAMAGED"], status, status, actor.employeeId);
  await audit(orgId, actor, `asset.marked_${status.toLowerCase()}`, assetId, { employeeId: closed?.employeeId ?? null });
  if (closed) await afterRelease(orgId, closed.employeeId, actor);
  return present(await requireAsset(orgId, assetId));
}

// FR-004: what an employee currently holds (self, their manager, HR/Admin).
export async function assetsForEmployee(orgId: string, employeeId: string, actor: AccessTokenPayload) {
  if (!isPrivileged(actor) && actor.employeeId !== employeeId) {
    const e = await getEmployeeSummary(orgId, employeeId);
    if (!e || e.managerId !== actor.employeeId) throw new DomainError("FORBIDDEN", "You can't view this employee's assets.", 403);
  }
  const open = await repo.openAssignmentsFor(orgId, [employeeId]);
  return open.map((a) => ({ ...a.asset, assignedAt: a.assignedAt }));
}

// Employee decorator (registered in app.ts): profile/list responses carry assignedAssets.
export async function assetsDecorator(orgId: string, employeeIds: string[]) {
  const open = await repo.openAssignmentsFor(orgId, employeeIds);
  const byEmployee = new Map<string, Array<{ id: string; description: string; identifier: string }>>();
  for (const a of open) byEmployee.set(a.employeeId, [...(byEmployee.get(a.employeeId) ?? []), a.asset]);
  return new Map(employeeIds.map((id) => [id, { assignedAssets: byEmployee.get(id) ?? [] }]));
}

// Exit task guard (registered in app.ts, US2.3): ASSET_RETURN can't be ticked while assets remain.
export async function assetReturnGuard(orgId: string, employeeId: string): Promise<string | null> {
  const open = await repo.openAssignmentsFor(orgId, [employeeId]);
  if (open.length === 0) return null;
  return `${open.length} asset(s) are still assigned: ${open.map((a) => a.asset.identifier).join(", ")}. Return or mark them lost/damaged first.`;
}
