// Business rules for expense claims. Framework-agnostic — no req/res.
// Implements specs/014-asset-expense-management/spec.md (User Story 3).
import { Prisma } from "@prisma/client";
import { DomainError } from "../../middleware/errorHandler.js";
import { getStorage } from "../../lib/storage.js";
import { getEmployeeSummary, listDirectReportIds } from "../employee/service.js";
import { notifyEmployees } from "../notifications/service.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";

type Claim = NonNullable<Awaited<ReturnType<typeof repo.findClaim>>>;
export interface ReceiptFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

// research.md R4: the categories an org starts with; HR edits them (FR-008).
export const DEFAULT_CATEGORIES = [
  { name: "Travel", requiresReceipt: true },
  { name: "Meals", requiresReceipt: true },
  { name: "Equipment", requiresReceipt: true },
  { name: "Internet & phone", requiresReceipt: false },
  { name: "Other", requiresReceipt: true },
];

const isPrivileged = (actor: AccessTokenPayload) => actor.role === "HR" || actor.role === "ADMIN";

// Never return the storage key; just whether a receipt exists.
function present(c: Claim) {
  const { receiptUrl, receiptContentType: _t, ...rest } = c;
  return { ...rest, hasReceipt: Boolean(receiptUrl) };
}

async function audit(orgId: string, actor: AccessTokenPayload, action: string, entityId: string, after?: unknown) {
  if (!actor.employeeId) return;
  await repo.writeActivityLog({ orgId, actorId: actor.employeeId, action, entity: "ExpenseClaim", entityId, after });
}

// --- Categories (FR-008) ---

export async function listCategories(orgId: string, activeOnly = true) {
  const existing = await repo.listCategories(orgId);
  if (existing.length === 0) await repo.createCategories(DEFAULT_CATEGORIES.map((c) => ({ orgId, ...c })));
  return repo.listCategories(orgId, activeOnly);
}

export async function createCategory(orgId: string, input: { name: string; requiresReceipt: boolean }) {
  await listCategories(orgId);
  try {
    return await repo.createCategory({ orgId, ...input });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DomainError("CATEGORY_EXISTS", "A category with this name already exists.", 409);
    }
    throw err;
  }
}

export async function updateCategory(orgId: string, id: string, input: { requiresReceipt?: boolean; active?: boolean }) {
  if (!(await repo.findCategory(orgId, id))) throw new DomainError("NOT_FOUND", "Category not found.", 404);
  return repo.updateCategory(id, input);
}

// --- Claims ---

// FR-007/FR-008: amount + active category + (receipt when the category requires one).
export async function submitClaim(
  orgId: string,
  input: { amount: number; category: string; description?: string },
  receipt: ReceiptFile | undefined,
  actor: AccessTokenPayload,
) {
  if (!actor.employeeId) throw new DomainError("FORBIDDEN", "Only employees submit expense claims.", 403);
  await listCategories(orgId);
  const category = await repo.findCategoryByName(orgId, input.category);
  if (!category || !category.active) {
    throw new DomainError("VALIDATION_ERROR", "Unknown expense category.", 400, { category: ["Pick one of the active categories."] });
  }
  if (category.requiresReceipt && !receipt) {
    throw new DomainError("RECEIPT_REQUIRED", `A receipt is required for ${category.name} expenses.`, 400, { file: ["Attach the receipt."] });
  }
  const receiptKey = receipt ? await getStorage().put(receipt.buffer, { contentType: receipt.mimetype, prefix: `expenses/${actor.employeeId}` }) : null;
  const claim = await repo.createClaim({
    orgId,
    employeeId: actor.employeeId,
    amount: Math.round(input.amount * 100) / 100,
    category: category.name,
    description: input.description,
    receiptUrl: receiptKey,
    receiptName: receipt?.originalname.slice(0, 200) ?? null,
    receiptContentType: receipt?.mimetype ?? null,
  });
  await audit(orgId, actor, "expense.submitted", claim.id, { amount: claim.amount, category: claim.category });

  // FR-009: routed to the current manager (in-app).
  const me = await getEmployeeSummary(orgId, actor.employeeId);
  if (me?.managerId) {
    await notifyEmployees(orgId, [me.managerId], {
      type: "EXPENSE_SUBMITTED",
      message: `${me.name} submitted a ${claim.category} expense of ${claim.amount.toFixed(2)}.`,
      link: `/expenses/claims/${claim.id}`,
    });
  }
  return present(claim);
}

export async function myClaims(orgId: string, actor: AccessTokenPayload) {
  if (!actor.employeeId) return [];
  return (await repo.listClaims(orgId, { employeeId: actor.employeeId })).map(present);
}

// FR-009 + edge case: a manager's queue is computed from *current* direct reports, so a pending
// claim follows a reporting-line change. HR/Admin see every pending claim.
export async function approvalQueue(orgId: string, actor: AccessTokenPayload) {
  if (isPrivileged(actor)) return (await repo.listClaims(orgId, { status: "PENDING" })).map(present);
  if (!actor.employeeId) return [];
  const reports = await listDirectReportIds(orgId, actor.employeeId);
  if (reports.length === 0) return [];
  return (await repo.listClaims(orgId, { status: "PENDING", employeeId: { in: reports } })).map(present);
}

async function requireClaim(orgId: string, id: string) {
  const claim = await repo.findClaim(orgId, id);
  if (!claim) throw new DomainError("NOT_FOUND", "Expense claim not found.", 404);
  return claim;
}

async function isCurrentManager(orgId: string, claim: Claim, actor: AccessTokenPayload) {
  const e = await getEmployeeSummary(orgId, claim.employeeId);
  return Boolean(e && actor.employeeId && e.managerId === actor.employeeId);
}

async function assertCanDecide(orgId: string, claim: Claim, actor: AccessTokenPayload) {
  if (claim.employeeId === actor.employeeId) throw new DomainError("FORBIDDEN", "You can't decide your own expense claim.", 403);
  if (isPrivileged(actor) || (await isCurrentManager(orgId, claim, actor))) return;
  throw new DomainError("FORBIDDEN", "Only this employee's manager or HR/Admin can decide this claim.", 403);
}

export async function getClaim(orgId: string, id: string, actor: AccessTokenPayload) {
  const claim = await requireClaim(orgId, id);
  if (claim.employeeId !== actor.employeeId && !isPrivileged(actor) && !(await isCurrentManager(orgId, claim, actor))) {
    throw new DomainError("NOT_FOUND", "Expense claim not found.", 404);
  }
  return present(claim);
}

export async function openReceipt(orgId: string, id: string, actor: AccessTokenPayload) {
  await getClaim(orgId, id, actor); // same visibility as the claim
  const claim = await requireClaim(orgId, id);
  if (!claim.receiptUrl) throw new DomainError("NOT_FOUND", "This claim has no receipt.", 404);
  return { name: claim.receiptName ?? "receipt", contentType: claim.receiptContentType ?? "application/octet-stream", stream: await getStorage().open(claim.receiptUrl) };
}

export async function approveClaim(orgId: string, id: string, actor: AccessTokenPayload) {
  const claim = await requireClaim(orgId, id);
  await assertCanDecide(orgId, claim, actor);
  const { count } = await repo.transitionClaim(id, "PENDING", { status: "APPROVED", approverId: actor.employeeId, decidedAt: new Date() });
  if (count === 0) throw new DomainError("ALREADY_DECIDED", "This claim has already been decided.", 409);
  await audit(orgId, actor, "expense.approved", id);
  await notifyEmployees(orgId, [claim.employeeId], { type: "EXPENSE_DECIDED", message: `Your ${claim.category} expense of ${claim.amount.toFixed(2)} was approved.`, link: `/expenses/claims/${id}` });
  return present(await requireClaim(orgId, id));
}

// FR-010: a reason is mandatory and shown to the submitter.
export async function rejectClaim(orgId: string, id: string, reason: string, actor: AccessTokenPayload) {
  const claim = await requireClaim(orgId, id);
  await assertCanDecide(orgId, claim, actor);
  const { count } = await repo.transitionClaim(id, "PENDING", { status: "REJECTED", approverId: actor.employeeId, decidedAt: new Date(), rejectionReason: reason });
  if (count === 0) throw new DomainError("ALREADY_DECIDED", "This claim has already been decided.", 409);
  await audit(orgId, actor, "expense.rejected", id, { reason });
  await notifyEmployees(orgId, [claim.employeeId], { type: "EXPENSE_DECIDED", message: `Your ${claim.category} expense was rejected: ${reason}`, link: `/expenses/claims/${id}` });
  return present(await requireClaim(orgId, id));
}

// FR-011: a status change, not a money movement (Assumptions).
export async function markPaid(orgId: string, id: string, actor: AccessTokenPayload) {
  await requireClaim(orgId, id);
  const { count } = await repo.transitionClaim(id, "APPROVED", { status: "PAID", paidAt: new Date(), paidById: actor.employeeId });
  if (count === 0) throw new DomainError("INVALID_STATE", "Only an approved, unpaid claim can be marked paid.", 409);
  await audit(orgId, actor, "expense.paid", id);
  return present(await requireClaim(orgId, id));
}

// SC-005: outstanding (approved-unpaid) liability in one view.
export async function payouts(orgId: string) {
  const outstanding = (await repo.listClaims(orgId, { status: "APPROVED" })).map(present);
  const total = Math.round(outstanding.reduce((s, c) => s + c.amount, 0) * 100) / 100;
  return { outstandingTotal: total, outstandingCount: outstanding.length, outstanding };
}
