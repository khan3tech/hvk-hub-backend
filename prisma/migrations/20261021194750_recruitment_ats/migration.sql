-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "InterviewRound" ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "recordedAt" TIMESTAMP(3);
