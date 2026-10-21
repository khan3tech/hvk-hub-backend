-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "awaitingHrSince" TIMESTAMP(3),
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "TicketCategory" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "TicketReply" ADD COLUMN     "fromHr" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "HelpdeskSettings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "overdueHours" INTEGER NOT NULL DEFAULT 48,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpdeskSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HelpdeskSettings_orgId_key" ON "HelpdeskSettings"("orgId");

