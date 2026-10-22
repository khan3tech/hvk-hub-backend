-- AlterTable
ALTER TABLE "Referral" ADD COLUMN     "closedReason" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "hireEmployeeId" TEXT,
ADD COLUMN     "payrollPeriodMonth" INTEGER,
ADD COLUMN     "payrollPeriodYear" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'IN_PIPELINE';
