-- CreateTable
CREATE TABLE "AssistantKnowledgeArticle" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "keywords" JSONB NOT NULL,
    "policyId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantKnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantKnowledgeArticle_orgId_idx" ON "AssistantKnowledgeArticle"("orgId");

