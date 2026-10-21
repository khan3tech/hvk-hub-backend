// Prisma queries only — this is the one place in the expenses module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";
import type { ExpenseStatus, Prisma } from "@prisma/client";

export function listCategories(orgId: string, activeOnly = false) {
  return prisma.expenseCategory.findMany({ where: { orgId, ...(activeOnly ? { active: true } : {}) }, orderBy: { name: "asc" } });
}

export function createCategories(rows: Prisma.ExpenseCategoryCreateManyInput[]) {
  return prisma.expenseCategory.createMany({ data: rows, skipDuplicates: true });
}

export function createCategory(data: Prisma.ExpenseCategoryUncheckedCreateInput) {
  return prisma.expenseCategory.create({ data });
}

export function findCategoryByName(orgId: string, name: string) {
  return prisma.expenseCategory.findFirst({ where: { orgId, name: { equals: name, mode: "insensitive" } } });
}

export function findCategory(orgId: string, id: string) {
  return prisma.expenseCategory.findFirst({ where: { id, orgId } });
}

export function updateCategory(id: string, data: Prisma.ExpenseCategoryUncheckedUpdateInput) {
  return prisma.expenseCategory.update({ where: { id }, data });
}

export function createClaim(data: Prisma.ExpenseClaimUncheckedCreateInput) {
  return prisma.expenseClaim.create({ data });
}

export function findClaim(orgId: string, id: string) {
  return prisma.expenseClaim.findFirst({ where: { id, orgId } });
}

export function listClaims(orgId: string, where: Prisma.ExpenseClaimWhereInput) {
  return prisma.expenseClaim.findMany({ where: { orgId, ...where }, orderBy: { createdAt: "desc" } });
}

// Conditional transitions: a claim is decided/paid once (no double approval or payment).
export function transitionClaim(id: string, from: ExpenseStatus, data: Prisma.ExpenseClaimUncheckedUpdateInput) {
  return prisma.expenseClaim.updateMany({ where: { id, status: from }, data });
}

export function writeActivityLog(params: {
  orgId: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}) {
  return prisma.activityLog.create({
    data: {
      ...params,
      before: params.before as Prisma.InputJsonValue | undefined,
      after: params.after as Prisma.InputJsonValue | undefined,
    },
  });
}
