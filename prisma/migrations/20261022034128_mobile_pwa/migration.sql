-- AlterTable
ALTER TABLE "DeviceRegistration" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "endpoint" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "deviceId" TEXT;

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "scopeHash" TEXT NOT NULL,
    "status" INTEGER,
    "body" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_scopeHash_key" ON "IdempotencyRecord"("scopeHash");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_createdAt_idx" ON "IdempotencyRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceRegistration_endpoint_key" ON "DeviceRegistration"("endpoint");

