-- AlterTable
ALTER TABLE "ExitChecklist" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "reportsToReassign" JSONB;

-- AlterTable
ALTER TABLE "Resignation" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "acknowledgedById" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "exitDuePromptedAt" TIMESTAMP(3),
ADD COLUMN     "forcedOffboard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "withdrawnAt" TIMESTAMP(3);

