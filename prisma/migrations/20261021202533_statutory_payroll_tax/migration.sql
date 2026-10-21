-- AlterTable
ALTER TABLE "ComplianceReport" ADD COLUMN     "generatedById" TEXT;

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "statutoryDeductions" JSONB;

-- AlterTable
ALTER TABLE "StatutoryComponent" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "groupId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "StatutoryExemption" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "groupId" TEXT NOT NULL,
ADD COLUMN     "reason" TEXT;

-- CreateIndex
CREATE INDEX "StatutoryComponent_orgId_groupId_effectiveFrom_idx" ON "StatutoryComponent"("orgId", "groupId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "StatutoryExemption_employeeId_groupId_key" ON "StatutoryExemption"("employeeId", "groupId");

