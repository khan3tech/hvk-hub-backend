-- CreateEnum
CREATE TYPE "TimeProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TimeEntrySource" AS ENUM ('MANUAL', 'TIMER');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "TimeProject" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientName" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "status" "TimeProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeProjectMember" (
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeProjectMember_pkey" PRIMARY KEY ("projectId","employeeId")
);

-- CreateTable
CREATE TABLE "TimeTask" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TimeProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weekStart" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "billable" BOOLEAN NOT NULL,
    "source" "TimeEntrySource" NOT NULL DEFAULT 'MANUAL',
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunningTimer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "RunningTimer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timesheet" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Timesheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeProject_orgId_status_idx" ON "TimeProject"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TimeProject_orgId_code_key" ON "TimeProject"("orgId", "code");

-- CreateIndex
CREATE INDEX "TimeProjectMember_orgId_employeeId_idx" ON "TimeProjectMember"("orgId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "TimeTask_projectId_name_key" ON "TimeTask"("projectId", "name");

-- CreateIndex
CREATE INDEX "TimeEntry_orgId_employeeId_weekStart_idx" ON "TimeEntry"("orgId", "employeeId", "weekStart");

-- CreateIndex
CREATE INDEX "TimeEntry_orgId_date_idx" ON "TimeEntry"("orgId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_orgId_projectId_date_idx" ON "TimeEntry"("orgId", "projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "RunningTimer_employeeId_key" ON "RunningTimer"("employeeId");

-- CreateIndex
CREATE INDEX "Timesheet_orgId_weekStart_status_idx" ON "Timesheet"("orgId", "weekStart", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Timesheet_employeeId_weekStart_key" ON "Timesheet"("employeeId", "weekStart");

-- AddForeignKey
ALTER TABLE "TimeProjectMember" ADD CONSTRAINT "TimeProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "TimeProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeTask" ADD CONSTRAINT "TimeTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "TimeProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "TimeProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TimeTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunningTimer" ADD CONSTRAINT "RunningTimer_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TimeTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

