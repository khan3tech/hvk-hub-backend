-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "managerVisible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalName" TEXT,
ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "uploadedById" TEXT;

-- AlterTable
ALTER TABLE "SignatureRequest" ADD COLUMN     "accessTokenHash" TEXT,
ADD COLUMN     "applicationId" TEXT,
ADD COLUMN     "sentById" TEXT,
ADD COLUMN     "signedByUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SignatureRequest_accessTokenHash_key" ON "SignatureRequest"("accessTokenHash");

