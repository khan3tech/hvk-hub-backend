-- CreateEnum
CREATE TYPE "ActivityState" AS ENUM ('ACTIVE', 'IDLE', 'LOCKED');

-- CreateTable
CREATE TABLE "ActivitySpan" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "state" "ActivityState" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivitySpan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityPresence" (
    "employeeId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "state" "ActivityState" NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "spanId" TEXT,

    CONSTRAINT "ActivityPresence_pkey" PRIMARY KEY ("employeeId")
);

-- CreateTable
CREATE TABLE "ActivitySettings" (
    "orgId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "idleThresholdMinutes" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivitySettings_pkey" PRIMARY KEY ("orgId")
);

-- CreateIndex
CREATE INDEX "ActivitySpan_orgId_employeeId_startedAt_idx" ON "ActivitySpan"("orgId", "employeeId", "startedAt");

-- CreateIndex
CREATE INDEX "ActivitySpan_endedAt_idx" ON "ActivitySpan"("endedAt");

-- CreateIndex
CREATE INDEX "ActivityPresence_orgId_idx" ON "ActivityPresence"("orgId");

