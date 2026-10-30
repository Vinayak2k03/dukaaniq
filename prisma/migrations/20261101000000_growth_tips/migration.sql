-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RecommendationType" ADD VALUE 'FESTIVE';
ALTER TYPE "RecommendationType" ADD VALUE 'OFF_PEAK';

-- CreateTable
CREATE TABLE "tip_session" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "referenceDate" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "candidates" JSONB NOT NULL,
    "shownKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "feedback" JSONB NOT NULL,
    "llmCalls" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tip_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tip_session_merchantId_createdAt_idx" ON "tip_session"("merchantId", "createdAt");

-- AddForeignKey
ALTER TABLE "tip_session" ADD CONSTRAINT "tip_session_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

