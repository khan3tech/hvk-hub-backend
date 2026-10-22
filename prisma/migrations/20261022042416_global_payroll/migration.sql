-- AlterTable
ALTER TABLE "Employee" DROP COLUMN "payrollCountry",
DROP COLUMN "payrollCurrency";

-- AlterTable
ALTER TABLE "ExchangeRate" ADD COLUMN     "recordedById" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "country" TEXT;

-- DropTable
DROP TABLE "ReportingCurrencyConfig";

-- CreateTable
CREATE TABLE "PayrollAssignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollCurrencySettings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "defaultCountry" TEXT,
    "defaultCurrency" TEXT,
    "reportingCurrency" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollCurrencySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollAssignment_orgId_employeeId_effectiveFrom_idx" ON "PayrollAssignment"("orgId", "employeeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollCurrencySettings_orgId_key" ON "PayrollCurrencySettings"("orgId");

-- AddForeignKey
ALTER TABLE "PayrollAssignment" ADD CONSTRAINT "PayrollAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

