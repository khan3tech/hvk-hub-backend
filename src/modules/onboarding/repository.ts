// Prisma queries only — this is the one place in the onboarding module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";
import type { OnboardingOwnerRole, Prisma } from "@prisma/client";

export function listTemplates(orgId: string) {
  return prisma.onboardingTaskTemplate.findMany({ where: { orgId }, orderBy: { order: "asc" } });
}

export function createTemplates(rows: Prisma.OnboardingTaskTemplateCreateManyInput[]) {
  return prisma.onboardingTaskTemplate.createMany({ data: rows });
}

export function createTemplate(data: Prisma.OnboardingTaskTemplateUncheckedCreateInput) {
  return prisma.onboardingTaskTemplate.create({ data });
}

export function findTemplate(orgId: string, id: string) {
  return prisma.onboardingTaskTemplate.findFirst({ where: { id, orgId } });
}

export function updateTemplate(id: string, data: Prisma.OnboardingTaskTemplateUncheckedUpdateInput) {
  return prisma.onboardingTaskTemplate.update({ where: { id }, data });
}

export function deleteTemplate(id: string) {
  return prisma.onboardingTaskTemplate.delete({ where: { id } });
}

const withTasks = { tasks: { orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }] } };

export function findChecklistByEmployee(orgId: string, employeeId: string) {
  return prisma.onboardingChecklist.findFirst({ where: { orgId, employeeId }, include: withTasks });
}

// Checklist + its tasks copied from the template in one transaction, so a checklist never
// exists half-populated.
export function createChecklistWithTasks(
  orgId: string,
  employeeId: string,
  tasks: Array<{ description: string; ownerRole: OnboardingOwnerRole; position: number; systemKey?: string | null }>,
) {
  return prisma.onboardingChecklist.create({
    data: {
      orgId,
      employeeId,
      tasks: { create: tasks.map((t) => ({ orgId, ...t })) },
    },
    include: withTasks,
  });
}

export function listChecklistsWithTasks(orgId: string, employeeIds?: string[]) {
  return prisma.onboardingChecklist.findMany({
    where: { orgId, ...(employeeIds ? { employeeId: { in: employeeIds } } : {}) },
    include: { tasks: { select: { status: true } } },
  });
}

export function findTask(orgId: string, id: string) {
  return prisma.onboardingTask.findFirst({ where: { id, orgId }, include: { checklist: true } });
}

export function createTask(data: Prisma.OnboardingTaskUncheckedCreateInput) {
  return prisma.onboardingTask.create({ data });
}

export function maxTaskPosition(checklistId: string) {
  return prisma.onboardingTask
    .aggregate({ where: { checklistId }, _max: { position: true } })
    .then((r) => r._max.position ?? -1);
}

export function updateTask(id: string, data: Prisma.OnboardingTaskUncheckedUpdateInput) {
  return prisma.onboardingTask.update({ where: { id }, data });
}

// Conditional update (only if still INCOMPLETE) so two people completing at once can't both win.
export function completeTask(id: string, completedById: string) {
  return prisma.onboardingTask.updateMany({
    where: { id, status: "INCOMPLETE" },
    data: { status: "COMPLETE", completedById, completedAt: new Date() },
  });
}

export function deleteTask(id: string) {
  return prisma.onboardingTask.delete({ where: { id } });
}

export function listIncompleteTasks(orgId: string) {
  return prisma.onboardingTask.findMany({
    where: { orgId, status: "INCOMPLETE" },
    include: { checklist: { select: { employeeId: true } } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
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
