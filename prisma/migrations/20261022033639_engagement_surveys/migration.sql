-- AlterTable
ALTER TABLE "Survey" ADD COLUMN     "audienceEmployeeIds" JSONB,
ADD COLUMN     "audienceSize" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "minResponses" INTEGER NOT NULL DEFAULT 5;

