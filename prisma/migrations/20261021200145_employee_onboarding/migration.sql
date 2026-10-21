-- AlterTable
ALTER TABLE "OnboardingTask" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ownerEmployeeId" TEXT,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "OnboardingTask_orgId_ownerEmployeeId_idx" ON "OnboardingTask"("orgId", "ownerEmployeeId");
