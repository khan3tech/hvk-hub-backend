-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "publicReferenceHash" TEXT;

-- AlterTable
ALTER TABLE "JobPosting" ADD COLUMN     "description" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Application_publicReferenceHash_key" ON "Application"("publicReferenceHash");

