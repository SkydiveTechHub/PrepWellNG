-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREEMIUM', 'STANDARD', 'PREMIUM');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "tier" "SubscriptionTier" NOT NULL DEFAULT 'FREEMIUM';
ALTER TABLE "User" ADD COLUMN "tierUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_tier_idx" ON "User"("tier");
