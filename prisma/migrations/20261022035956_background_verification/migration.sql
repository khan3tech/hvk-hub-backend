-- AlterTable
ALTER TABLE "BackgroundCheck" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "initiatedById" TEXT;

-- AlterTable
ALTER TABLE "BackgroundCheckItem" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "recordedAt" TIMESTAMP(3),
ADD COLUMN     "recordedById" TEXT;

-- AlterTable
ALTER TABLE "HireOverride" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'FLAGGED_CHECK';

-- CreateTable
CREATE TABLE "BackgroundCheckSettings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "defaultItems" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackgroundCheckSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundCheckSettings_orgId_key" ON "BackgroundCheckSettings"("orgId");

