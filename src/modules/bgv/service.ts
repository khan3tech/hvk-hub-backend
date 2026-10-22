// Background verification (specs/022-background-verification). HR/Admin only (FR-008).
import { Prisma } from "@prisma/client";
import { DomainError } from "../../middleware/errorHandler.js";
import { getApplicationSummary } from "../recruitment/service.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";

export const DEFAULT_ITEMS = ["Employment history", "Education", "Professional references", "Identity verification"];
type Check = NonNullable<Awaited<ReturnType<typeof repo.findCheck>>>;
const isHr = (actor: AccessTokenPayload) => actor.role === "HR" || actor.role === "ADMIN";

async function audit(orgId: string, actor: AccessTokenPayload, action: string, entityId: string, after?: unknown) {
  if (actor.employeeId) await repo.writeActivityLog({ orgId, actorId: actor.employeeId, action, entity: "BackgroundCheck", entityId, after });
}

function present(c: Check) {
  return { ...c, hasUnverified: c.items.some((i) => i.result === "UNABLE_TO_VERIFY") };
}

export async function getDefaults(orgId: string) {
  const s = await repo.findSettings(orgId);
  return { defaultItems: (s?.defaultItems as string[] | undefined) ?? DEFAULT_ITEMS };
}

export async function setDefaults(orgId: string, items: string[]) {
  await repo.upsertSettings(orgId, items);
  return getDefaults(orgId);
}

// FR-001: one check per application; items chosen per initiation (defaults if omitted).
export async function initiate(orgId: string, applicationId: string, items: string[] | undefined, actor: AccessTokenPayload) {
  const app = await getApplicationSummary(orgId, applicationId);
  if (!app) throw new DomainError("NOT_FOUND", "Application not found.", 404);
  if (app.stage === "HIRED" || app.stage === "REJECTED") {
    throw new DomainError("INVALID_STATE", "This application already has a final outcome.", 409);
  }
  const labels = items?.length ? items : (await getDefaults(orgId)).defaultItems;
  try {
    const check = await repo.createCheck(orgId, applicationId, labels, actor.employeeId);
    await audit(orgId, actor, "bgv.initiated", check.id, { applicationId, items: labels });
    return present(check);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DomainError("CHECK_EXISTS", "This application already has a background check.", 409);
    }
    throw err;
  }
}

export async function getCheck(orgId: string, id: string) {
  const c = await repo.findCheck(orgId, id);
  if (!c) throw new DomainError("NOT_FOUND", "Background check not found.", 404);
  return { ...present(c), overrides: await repo.listOverrides(orgId, c.applicationId) };
}

export async function getForApplication(orgId: string, applicationId: string) {
  const c = await repo.findCheckByApplication(orgId, applicationId);
  if (!c) throw new DomainError("NOT_FOUND", "No background check for this application.", 404);
  return getCheck(orgId, c.id);
}

export async function list(orgId: string, status?: string) {
  return (await repo.listChecks(orgId, status ? { status: status as never } : {})).map(present);
}

// FR-003/SC-002: complete exactly when every item has a result; FLAGGED if any item is flagged.
async function recompute(c: Check) {
  const results = c.items.map((i) => i.result);
  if (results.length > 0 && results.every((r) => r !== null)) {
    return repo.updateCheck(c.id, { status: "COMPLETE", overallOutcome: results.includes("FLAGGED") ? "FLAGGED" : "CLEARED", completedAt: c.completedAt ?? new Date() });
  }
  const started = results.some((r) => r !== null);
  return repo.updateCheck(c.id, { status: started ? "IN_PROGRESS" : "PENDING", overallOutcome: null, completedAt: null });
}

// FR-002: one result per item with notes (UNABLE_TO_VERIFY is its own state).
export async function recordResult(orgId: string, itemId: string, input: { result: "CLEARED" | "FLAGGED" | "UNABLE_TO_VERIFY"; notes?: string }, actor: AccessTokenPayload) {
  const item = await repo.findItem(orgId, itemId);
  if (!item) throw new DomainError("NOT_FOUND", "Check item not found.", 404);
  const { count } = await repo.recordResult(itemId, { result: input.result, notes: input.notes ?? null, recordedById: actor.employeeId });
  if (count === 0) throw new DomainError("RESULT_RECORDED", "This item already has a result. Add a new item to re-verify.", 409);
  await audit(orgId, actor, "bgv.result_recorded", item.backgroundCheckId, { itemId, result: input.result });
  const updated = await recompute((await repo.findCheck(orgId, item.backgroundCheckId))!);
  return present(updated);
}

// FR-004: adding an item reopens a completed check.
export async function addItem(orgId: string, checkId: string, label: string, actor: AccessTokenPayload) {
  const c = await repo.findCheck(orgId, checkId);
  if (!c) throw new DomainError("NOT_FOUND", "Background check not found.", 404);
  await repo.addItem(orgId, checkId, label);
  await audit(orgId, actor, "bgv.item_added", checkId, { label });
  return present(await recompute((await repo.findCheck(orgId, checkId))!));
}

// --- Registered with recruitment in app.ts ---

// FR-005/006/007, SC-003: gate before HIRED.
export async function hireGate(orgId: string, applicationId: string, justification: string | undefined, actor: AccessTokenPayload) {
  const c = await repo.findCheckByApplication(orgId, applicationId);
  if (c?.status === "COMPLETE" && c.overallOutcome === "CLEARED") return;
  const kind = c?.status === "COMPLETE" ? "FLAGGED_CHECK" : "INCOMPLETE_CHECK";
  if (!isHr(actor) || !justification || !actor.employeeId) {
    throw new DomainError(
      kind === "FLAGGED_CHECK" ? "JUSTIFICATION_REQUIRED" : "BACKGROUND_CHECK_INCOMPLETE",
      kind === "FLAGGED_CHECK"
        ? "The background check flagged an issue. HR/Admin must give a written justification to hire."
        : "Complete the background check first, or have HR/Admin override with a reason.",
      409,
    );
  }
  await repo.createOverride({ orgId, applicationId, justification, kind, overriddenById: actor.employeeId });
  await audit(orgId, actor, "bgv.hire_override", c?.id ?? applicationId, { applicationId, kind });
}

// Application views: HR/Admin see status + outcome; others only that a check exists and its status.
export async function applicationDecoration(orgId: string, applicationId: string, actor: AccessTokenPayload) {
  const c = await repo.findCheckByApplication(orgId, applicationId);
  if (!c) return { backgroundCheck: null };
  return { backgroundCheck: isHr(actor) ? { id: c.id, status: c.status, overallOutcome: c.overallOutcome } : { status: c.status } };
}

export async function deleteForApplications(applicationIds: string[]) {
  if (applicationIds.length) await repo.deleteForApplications(applicationIds);
}
