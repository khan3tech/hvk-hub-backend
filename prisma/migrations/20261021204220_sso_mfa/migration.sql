-- AlterTable
ALTER TABLE "IdentityProviderConfig" ADD COLUMN     "mfaRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedById" TEXT,
ALTER COLUMN "provider" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MfaEnrollment" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "failedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastUsedStep" INTEGER,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "pendingSecret" TEXT,
ALTER COLUMN "secret" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SsoIdentityLink" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "email" TEXT;

