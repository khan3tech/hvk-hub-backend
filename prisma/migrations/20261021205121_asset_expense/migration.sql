-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "AssetAssignment" ADD COLUMN     "assignedById" TEXT,
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "outcome" TEXT;

-- AlterTable
ALTER TABLE "ExitTask" ADD COLUMN     "systemKey" TEXT;

-- AlterTable
ALTER TABLE "ExpenseClaim" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "paidById" TEXT,
ADD COLUMN     "receiptContentType" TEXT,
ADD COLUMN     "receiptName" TEXT;

-- AlterTable
ALTER TABLE "OnboardingTask" ADD COLUMN     "systemKey" TEXT;

-- AlterTable
ALTER TABLE "OnboardingTaskTemplate" ADD COLUMN     "systemKey" TEXT;

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiresReceipt" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_orgId_name_key" ON "ExpenseCategory"("orgId", "name");

