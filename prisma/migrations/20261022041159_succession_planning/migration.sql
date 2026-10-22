-- AlterTable
ALTER TABLE "SuccessionCandidate" ADD COLUMN     "addedById" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "invalidReason" TEXT,
ADD COLUMN     "invalidatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SuccessionPlan" ADD COLUMN     "isCritical" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "markedById" TEXT,
ADD COLUMN     "unmarkedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SuccessionReadinessChange" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "fromLevel" "ReadinessLevel",
    "toLevel" "ReadinessLevel" NOT NULL,
    "note" TEXT,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuccessionReadinessChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SuccessionReadinessChange_candidateId_idx" ON "SuccessionReadinessChange"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "SuccessionCandidate_successionPlanId_candidateEmployeeId_key" ON "SuccessionCandidate"("successionPlanId", "candidateEmployeeId");

-- AddForeignKey
ALTER TABLE "SuccessionReadinessChange" ADD CONSTRAINT "SuccessionReadinessChange_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "SuccessionCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

