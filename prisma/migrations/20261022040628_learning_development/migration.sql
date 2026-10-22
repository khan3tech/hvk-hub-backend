-- CreateEnum
CREATE TYPE "CourseAudience" AS ENUM ('COMPANY', 'DEPARTMENT', 'EMPLOYEES');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "CourseAssignment" ADD COLUMN     "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "assignedById" TEXT,
ADD COLUMN     "ruleId" TEXT;

-- CreateTable
CREATE TABLE "CourseAssignmentRule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "audience" "CourseAudience" NOT NULL,
    "departmentId" TEXT,
    "dueDate" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseAssignmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseAssignmentRule_orgId_courseId_idx" ON "CourseAssignmentRule"("orgId", "courseId");

-- AddForeignKey
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CourseAssignmentRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignmentRule" ADD CONSTRAINT "CourseAssignmentRule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

