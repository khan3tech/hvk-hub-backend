// Business rules for goals, reviews and review cycles. Framework-agnostic — no req/res.
// Implements specs/012-performance-management/spec.md.
import moment from "moment";
import { DomainError } from "../../middleware/errorHandler.js";
import { getEmployeeSummary, listActiveEmployeeSummaries, listDirectReportIds } from "../employee/service.js";
import { notifyEmployees } from "../notifications/service.js";
import * as repo from "./repository.js";
import { RATING_SCALE } from "./schema.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";

type Goal = NonNullable<Awaited<ReturnType<typeof repo.findGoal>>>;
type Review = NonNullable<Awaited<ReturnType<typeof repo.findReview>>>;

const isPrivileged = (actor: AccessTokenPayload) => actor.role === "HR" || actor.role === "ADMIN";
const day = (d: Date) => moment.utc(d).format("YYYY-MM-DD");
const todayUtc = () => moment.utc().startOf("day").toDate();

async function audit(orgId: string, actor: AccessTokenPayload, action: string, entity: string, entityId: string, after?: unknown, before?: unknown) {
  if (!actor.employeeId) return;
  await repo.writeActivityLog({ orgId, actorId: actor.employeeId, action, entity, entityId, before, after });
}

async function requireEmployee(orgId: string, employeeId: string) {
  const e = await getEmployeeSummary(orgId, employeeId);
  if (!e) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  return e;
}

const presentGoal = (g: Goal) => ({ ...g, targetDate: day(g.targetDate) });

// --- Goals (US1) ---

export async function createGoal(orgId: string, input: { description: string; targetDate: string }, actor: AccessTokenPayload) {
  if (!actor.employeeId) throw new DomainError("FORBIDDEN", "Only employees set goals.", 403);
  const me = await requireEmployee(orgId, actor.employeeId);
  if (me.status !== "ACTIVE") throw new DomainError("FORBIDDEN", "Only active employees set goals.", 403);
  const goal = await repo.createGoal({ orgId, employeeId: me.id, description: input.description, targetDate: moment.utc(input.targetDate).toDate() });
  await audit(orgId, actor, "goal.created", "Goal", goal.id, { description: goal.description, targetDate: input.targetDate });
  if (me.managerId) {
    await notifyEmployees(orgId, [me.managerId], { type: "GOAL_SUBMITTED", message: `${me.name} proposed a goal for your approval.`, link: `/performance/goals/${goal.id}` });
  }
  return presentGoal(goal);
}

// Self, their current manager (live reporting line, edge case), or HR/Admin.
async function assertCanSeeEmployee(orgId: string, employeeId: string, actor: AccessTokenPayload) {
  if (isPrivileged(actor) || actor.employeeId === employeeId) return;
  const e = await getEmployeeSummary(orgId, employeeId);
  if (e && actor.employeeId && e.managerId === actor.employeeId) return;
  throw new DomainError("FORBIDDEN", "You don't have access to this employee's performance records.", 403);
}

export async function listGoals(orgId: string, employeeId: string, actor: AccessTokenPayload) {
  await assertCanSeeEmployee(orgId, employeeId, actor);
  return (await repo.listGoals(orgId, { employeeId })).map(presentGoal);
}

async function requireGoal(orgId: string, id: string) {
  const goal = await repo.findGoal(orgId, id);
  if (!goal) throw new DomainError("NOT_FOUND", "Goal not found.", 404);
  return goal;
}

// FR-002/FR-003: the employee's current manager (or HR/Admin) decides; never the owner.
async function assertCanDecideGoal(orgId: string, goal: Goal, actor: AccessTokenPayload) {
  if (goal.employeeId === actor.employeeId) throw new DomainError("FORBIDDEN", "You can't approve your own goal.", 403);
  if (isPrivileged(actor)) return;
  const e = await getEmployeeSummary(orgId, goal.employeeId);
  if (!e || !actor.employeeId || e.managerId !== actor.employeeId) {
    throw new DomainError("FORBIDDEN", "Only this employee's manager can review their goals.", 403);
  }
}

export async function approveGoal(orgId: string, id: string, actor: AccessTokenPayload) {
  const goal = await requireGoal(orgId, id);
  await assertCanDecideGoal(orgId, goal, actor);
  const { count } = await repo.transitionGoal(id, ["PENDING_APPROVAL"], { status: "ACTIVE", approvedById: actor.employeeId, approvedAt: new Date(), changeRequestNote: null });
  if (count === 0) throw new DomainError("INVALID_STATE", "Only a goal pending approval can be approved.", 409);
  await audit(orgId, actor, "goal.approved", "Goal", id);
  await notifyEmployees(orgId, [goal.employeeId], { type: "GOAL_DECIDED", message: `Your goal "${goal.description.slice(0, 60)}" was approved.`, link: `/performance/goals/${id}` });
  return presentGoal(await requireGoal(orgId, id));
}

export async function requestGoalChanges(orgId: string, id: string, note: string, actor: AccessTokenPayload) {
  const goal = await requireGoal(orgId, id);
  await assertCanDecideGoal(orgId, goal, actor);
  const { count } = await repo.transitionGoal(id, ["PENDING_APPROVAL"], { status: "CHANGES_REQUESTED", changeRequestNote: note });
  if (count === 0) throw new DomainError("INVALID_STATE", "Changes can only be requested on a goal pending approval.", 409);
  await audit(orgId, actor, "goal.changes_requested", "Goal", id, { note });
  await notifyEmployees(orgId, [goal.employeeId], { type: "GOAL_DECIDED", message: `Changes requested on your goal: ${note}`, link: `/performance/goals/${id}` });
  return presentGoal(await requireGoal(orgId, id));
}

// US1.4: the owner revises and resubmits; the manager's note stays visible until approval.
export async function reviseGoal(orgId: string, id: string, input: { description?: string; targetDate?: string }, actor: AccessTokenPayload) {
  const goal = await requireGoal(orgId, id);
  if (goal.employeeId !== actor.employeeId) throw new DomainError("FORBIDDEN", "Only the goal's owner can revise it.", 403);
  const { count } = await repo.transitionGoal(id, ["CHANGES_REQUESTED", "PENDING_APPROVAL"], {
    status: "PENDING_APPROVAL",
    ...(input.description ? { description: input.description } : {}),
    ...(input.targetDate ? { targetDate: moment.utc(input.targetDate).toDate() } : {}),
  });
  if (count === 0) throw new DomainError("INVALID_STATE", "Only a goal awaiting approval or changes can be revised.", 409);
  await audit(orgId, actor, "goal.revised", "Goal", id, input);
  const me = await getEmployeeSummary(orgId, goal.employeeId);
  if (me?.managerId) await notifyEmployees(orgId, [me.managerId], { type: "GOAL_SUBMITTED", message: `${me.name} resubmitted a goal for approval.`, link: `/performance/goals/${id}` });
  return presentGoal(await requireGoal(orgId, id));
}

// FR-004: owner updates an ACTIVE goal until its target date.
export async function updateGoalProgress(orgId: string, id: string, input: { progressPercent?: number; progress?: string; completed?: boolean }, actor: AccessTokenPayload) {
  const goal = await requireGoal(orgId, id);
  if (goal.employeeId !== actor.employeeId) throw new DomainError("FORBIDDEN", "Only the goal's owner can update its progress.", 403);
  if (goal.status !== "ACTIVE") throw new DomainError("INVALID_STATE", "Progress can only be updated on an active goal.", 409);
  if (todayUtc() > goal.targetDate) throw new DomainError("PERIOD_ENDED", "This goal's period has ended.", 409);
  const { count } = await repo.transitionGoal(id, ["ACTIVE"], {
    ...(input.progress !== undefined ? { progress: input.progress } : {}),
    ...(input.progressPercent !== undefined ? { progressPercent: input.progressPercent } : {}),
    ...(input.completed ? { status: "COMPLETED", progressPercent: 100 } : {}),
  });
  if (count === 0) throw new DomainError("INVALID_STATE", "Progress can only be updated on an active goal.", 409);
  await audit(orgId, actor, "goal.progress_updated", "Goal", id, input);
  return presentGoal(await requireGoal(orgId, id));
}

// --- Review cycles (US3) ---

export async function createCycle(
  orgId: string,
  input: { name: string; startDate: string; endDate: string; scopeType: "COMPANY" | "DEPARTMENT"; departmentId?: string; employeeIds?: string[] },
  actor: AccessTokenPayload,
) {
  const active = await listActiveEmployeeSummaries(orgId);
  let covered = active;
  if (input.employeeIds) {
    const wanted = new Set(input.employeeIds);
    covered = active.filter((e) => wanted.has(e.id));
    if (covered.length !== wanted.size) {
      throw new DomainError("VALIDATION_ERROR", "Every employee in a cycle must be an active employee.", 400, { employeeIds: ["Unknown or inactive employee."] });
    }
  } else if (input.scopeType === "DEPARTMENT") {
    covered = active.filter((e) => e.departmentId === input.departmentId);
  }
  // research.md R3: employees without a manager are reviewed by the HR/Admin who opened the cycle.
  const reviews = covered
    .map((e) => ({ employeeId: e.id, managerId: e.managerId ?? actor.employeeId ?? "" }))
    .filter((r) => r.managerId && r.managerId !== r.employeeId);

  const cycle = await repo.createCycleWithReviews(
    {
      orgId,
      name: input.name,
      startDate: moment.utc(input.startDate).toDate(),
      endDate: moment.utc(input.endDate).toDate(),
      scopeType: input.scopeType,
      departmentId: input.scopeType === "DEPARTMENT" ? input.departmentId ?? null : null,
      createdById: actor.employeeId,
    },
    reviews,
  );
  await audit(orgId, actor, "review_cycle.opened", "ReviewCycle", cycle.id, { name: input.name, reviews: cycle.reviews.length });
  return { ...cycle, startDate: day(cycle.startDate), endDate: day(cycle.endDate), reviewCount: cycle.reviews.length, reviews: undefined };
}

export async function listCycles(orgId: string) {
  return (await repo.listCycles(orgId)).map((c) => ({ ...c, startDate: day(c.startDate), endDate: day(c.endDate) }));
}

const isOverdue = (r: Review, employeeActive: boolean) =>
  r.status === "IN_PROGRESS" && employeeActive && r.reviewCycle.endDate < todayUtc();

// FR-009/FR-010/SC-003 + offboarded edge case.
export async function cycleStatus(orgId: string, cycleId: string) {
  if (!(await repo.findCycle(orgId, cycleId))) throw new DomainError("NOT_FOUND", "Review cycle not found.", 404);
  const reviews = await repo.listReviews(orgId, { reviewCycleId: cycleId });
  const rows = [];
  for (const r of reviews) {
    const e = await getEmployeeSummary(orgId, r.employeeId);
    const required = e?.status === "ACTIVE";
    rows.push({ reviewId: r.id, employeeId: r.employeeId, employeeName: e?.name ?? "", managerId: r.managerId, status: r.status, overdue: isOverdue(r, required), required });
  }
  return {
    cycleId,
    completed: rows.filter((r) => r.status === "FINAL").length,
    pending: rows.filter((r) => r.status !== "FINAL" && r.required).length,
    overdue: rows.filter((r) => r.overdue).length,
    notRequired: rows.filter((r) => r.status !== "FINAL" && !r.required).length,
    reviews: rows,
  };
}

// --- Reviews (US2) ---

// FR-011/SC-005: an in-progress review follows the employee's current manager; the change is
// recorded on the review and in the audit log.
async function syncReviewer(orgId: string, review: Review): Promise<Review> {
  if (review.status !== "IN_PROGRESS") return review;
  const e = await getEmployeeSummary(orgId, review.employeeId);
  if (!e?.managerId || e.managerId === review.managerId || e.managerId === review.employeeId) return review;
  const updated = await repo.updateReview(review.id, { managerId: e.managerId, previousManagerId: review.managerId, managerChangedAt: new Date() });
  await repo.writeActivityLog({ orgId, actorId: e.managerId, action: "review.transferred", entity: "Review", entityId: review.id, before: { managerId: review.managerId }, after: { managerId: e.managerId } });
  return updated;
}

async function loadReview(orgId: string, id: string) {
  const review = await repo.findReview(orgId, id);
  if (!review) throw new DomainError("NOT_FOUND", "Review not found.", 404);
  return syncReviewer(orgId, review);
}

async function present(orgId: string, review: Review, withGoals: boolean) {
  const e = await getEmployeeSummary(orgId, review.employeeId);
  const base = {
    ...review,
    ratingLabel: review.rating ? RATING_SCALE[review.rating as keyof typeof RATING_SCALE] ?? null : null,
    overdue: isOverdue(review, e?.status === "ACTIVE"),
  };
  if (!withGoals) return base;
  // US2.1: the period's approved goals with their final progress (none is fine — edge case).
  const goals = await repo.listGoals(orgId, {
    employeeId: review.employeeId,
    status: { in: ["ACTIVE", "COMPLETED"] },
    targetDate: { gte: review.reviewCycle.startDate, lte: review.reviewCycle.endDate },
  });
  return { ...base, goals: goals.map(presentGoal) };
}

export async function getReview(orgId: string, id: string, actor: AccessTokenPayload) {
  const review = await loadReview(orgId, id);
  if (!isPrivileged(actor) && actor.employeeId !== review.employeeId && actor.employeeId !== review.managerId) {
    throw new DomainError("NOT_FOUND", "Review not found.", 404);
  }
  return present(orgId, review, true);
}

// The caller's reviews to write: assigned to them, plus any of their current direct reports'
// in-progress reviews (synced, so a just-transferred review shows up here immediately).
export async function listReviewsToDo(orgId: string, actor: AccessTokenPayload) {
  if (!actor.employeeId) return [];
  const reports = await listDirectReportIds(orgId, actor.employeeId);
  const candidates = await repo.listReviews(orgId, { status: "IN_PROGRESS", OR: [{ managerId: actor.employeeId }, { employeeId: { in: reports } }] });
  const mine = [];
  for (const r of candidates) {
    const synced = await syncReviewer(orgId, r);
    if (synced.managerId === actor.employeeId) mine.push(await present(orgId, synced, false));
  }
  return mine;
}

async function requireReviewer(orgId: string, id: string, actor: AccessTokenPayload) {
  const review = await loadReview(orgId, id);
  if (review.managerId !== actor.employeeId) throw new DomainError("FORBIDDEN", "Only this review's manager can do that.", 403);
  if (review.status === "FINAL") throw new DomainError("REVIEW_FINAL", "This review is final. HR/Admin can correct it.", 409);
  return review;
}

export async function saveManagerDraft(orgId: string, id: string, input: { rating?: string; managerComments?: string }, actor: AccessTokenPayload) {
  await requireReviewer(orgId, id, actor);
  const { count } = await repo.updateInProgressReview(id, input);
  if (count === 0) throw new DomainError("REVIEW_FINAL", "This review is final. HR/Admin can correct it.", 409);
  return getReview(orgId, id, actor);
}

// FR-006: the employee's own comments, before finalization.
export async function addSelfReflection(orgId: string, id: string, employeeComments: string, actor: AccessTokenPayload) {
  const review = await loadReview(orgId, id);
  if (review.employeeId !== actor.employeeId) throw new DomainError("FORBIDDEN", "Only the reviewed employee can add self-reflection.", 403);
  if (review.status === "FINAL") throw new DomainError("REVIEW_FINAL", "This review is final. HR/Admin can correct it.", 409);
  const { count } = await repo.updateInProgressReview(id, { employeeComments });
  if (count === 0) throw new DomainError("REVIEW_FINAL", "This review is final. HR/Admin can correct it.", 409);
  await audit(orgId, actor, "review.self_reflection_added", "Review", id);
  return getReview(orgId, id, actor);
}

// FR-005/FR-007: the manager finalizes with a rating; afterwards it's locked.
export async function finalizeReview(orgId: string, id: string, actor: AccessTokenPayload) {
  const review = await requireReviewer(orgId, id, actor);
  if (!review.rating) {
    throw new DomainError("VALIDATION_ERROR", "Add a rating before finalizing.", 400, { rating: ["Required to finalize."] });
  }
  const { count } = await repo.updateInProgressReview(id, { status: "FINAL", finalizedAt: new Date() });
  if (count === 0) throw new DomainError("REVIEW_FINAL", "This review is already final.", 409);
  await audit(orgId, actor, "review.finalized", "Review", id, { rating: review.rating });
  await notifyEmployees(orgId, [review.employeeId], { type: "REVIEW_FINALIZED", message: `Your review for "${review.reviewCycle.name}" is complete.`, link: `/performance/reviews/${id}` });
  return getReview(orgId, id, actor);
}

// FR-007: only HR/Admin correct a final review, and every correction is recorded.
export async function correctReview(orgId: string, id: string, input: { rating?: string; managerComments?: string; reason: string }, actor: AccessTokenPayload) {
  const review = await repo.findReview(orgId, id);
  if (!review) throw new DomainError("NOT_FOUND", "Review not found.", 404);
  if (review.status !== "FINAL") throw new DomainError("INVALID_STATE", "Only a final review needs a correction; edit drafts normally.", 409);
  const change = { ...(input.rating ? { rating: input.rating } : {}), ...(input.managerComments !== undefined ? { managerComments: input.managerComments } : {}) };
  await repo.updateReview(id, { ...change, correctedAt: new Date() });
  await audit(orgId, actor, "review.corrected", "Review", id, { ...change, reason: input.reason }, { rating: review.rating, managerComments: review.managerComments });
  return getReview(orgId, id, actor);
}

// FR-012: the employee's full history (self, HR/Admin, or current manager).
export async function employeeHistory(orgId: string, employeeId: string, actor: AccessTokenPayload) {
  await assertCanSeeEmployee(orgId, employeeId, actor);
  const [goals, reviews] = await Promise.all([repo.listGoals(orgId, { employeeId }), repo.listReviews(orgId, { employeeId })]);
  return {
    employeeId,
    goals: goals.map(presentGoal),
    reviews: await Promise.all(reviews.map((r) => present(orgId, r, false))),
  };
}
