// Prisma queries only — this is the one place in the assistant module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";

// FR-007: topic, outcome and grounding kind only — never the question text or who asked.
export function recordInteractions(rows: Array<{ orgId: string; topic: string; wasAnswered: boolean; groundingType: string | null; createdAt: Date }>) {
  return prisma.assistantInteraction.createMany({ data: rows });
}

export function listInteractions(orgId: string, from: Date, to: Date) {
  return prisma.assistantInteraction.findMany({ where: { orgId, createdAt: { gte: from, lte: to } }, select: { topic: true, wasAnswered: true, groundingType: true } });
}

export function listArticles(orgId: string) {
  return prisma.assistantKnowledgeArticle.findMany({ where: { orgId }, orderBy: { title: "asc" } });
}

export function findArticle(orgId: string, id: string) {
  return prisma.assistantKnowledgeArticle.findFirst({ where: { orgId, id } });
}

export function createArticle(data: { orgId: string; title: string; body: string; keywords: string[]; policyId: string | null; createdById: string | null }) {
  return prisma.assistantKnowledgeArticle.create({ data });
}

export function updateArticle(id: string, data: { title?: string; body?: string; keywords?: string[]; policyId?: string | null }) {
  return prisma.assistantKnowledgeArticle.update({ where: { id }, data });
}

export function deleteArticle(id: string) {
  return prisma.assistantKnowledgeArticle.delete({ where: { id } });
}
