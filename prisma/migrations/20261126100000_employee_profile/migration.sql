-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "photoContentType" TEXT,
ADD COLUMN     "photoKey" TEXT,
ADD COLUMN     "photoUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmployeePersonalDetails" (
    "employeeId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "phone" TEXT,
    "personalEmail" TEXT,
    "dateOfBirth" DATE,
    "gender" TEXT,
    "bloodGroup" TEXT,
    "maritalStatus" TEXT,
    "currentAddress" TEXT,
    "permanentAddress" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactRelation" TEXT,
    "emergencyContactPhone" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePersonalDetails_pkey" PRIMARY KEY ("employeeId")
);

-- CreateIndex
CREATE INDEX "EmployeePersonalDetails_orgId_idx" ON "EmployeePersonalDetails"("orgId");

-- AddForeignKey
ALTER TABLE "EmployeePersonalDetails" ADD CONSTRAINT "EmployeePersonalDetails_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

