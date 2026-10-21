// Prisma queries only — this is the one place in the performance module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";
import type { GoalStatus, Prisma } from "@prisma/client";

export function createGoal(data: Prisma.GoalUncheckedCreateInput) {
  return prisma.goal.create({ data });
}

export function findGoal(orgId: string, id: string) {
  return prisma.goal.findFirst({ where: { id, orgId } });
}

export function listGoals(orgId: string, where: Prisma.GoalWhereInput) {
  return prisma.goal.findMany({ where: { orgId, ...where }, orderBy: [{ targetDate: "asc" }, { createdAt: "asc" }] });
}

// Conditional on the current status so concurrent approve/request-changes can't both land.
export function transitionGoal(id: string, from: GoalStatus[], data: Prisma.GoalUncheckedUpdateInput) {
  return prisma.goal.updateMany({ where: { id, status: { in: from } }, data });
}

export function createCycleWithReviews(
  data: Prisma.ReviewCycleUncheckedCreateInput,
  reviews: Array<{ employeeId: string; managerId: string }>,
) {
  return prisma.reviewCycle.create({
    data: { ...data, reviews: { create: reviews.map((r) => ({ orgId: data.orgId, ...r })) } },
    include: { reviews: true },
  });
}

export function findCycle(orgId: string, id: string) {
  return prisma.reviewCycle.findFirst({ where: { id, orgId } });
}

export function listCycles(orgId: string) {
  return prisma.reviewCycle.findMany({ where: { orgId }, orderBy: { startDate: "desc" } });
}

export function findReview(orgId: string, id: string) {
  return prisma.review.findFirst({ where: { id, orgId }, include: { reviewCycle: true } });
}

export function listReviews(orgId: string, where: Prisma.ReviewWhereInput) {
  return prisma.review.findMany({ where: { orgId, ...where }, include: { reviewCycle: true }, orderBy: { createdAt: "asc" } });
}

export function updateReview(id: string, data: Prisma.ReviewUncheckedUpdateInput) {
  return prisma.review.update({ where: { id }, data, include: { reviewCycle: true } });
}

// Only while IN_PROGRESS — the FINAL lock (FR-007) holds even under concurrent requests.
export function updateInProgressReview(id: string, data: Prisma.ReviewUncheckedUpdateInput) {
  return prisma.review.updateMany({ where: { id, status: "IN_PROGRESS" }, data });
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
