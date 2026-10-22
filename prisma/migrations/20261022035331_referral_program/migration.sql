-- AlterEnum (separate migration: Postgres can't use a new enum value in the same transaction)
ALTER TYPE "ReferralStatus" ADD VALUE 'IN_PIPELINE';
