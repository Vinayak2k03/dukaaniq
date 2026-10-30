-- CreateEnum
CREATE TYPE "DiscountReason" AS ENUM ('NONE', 'COUPON', 'MERCHANT_DISCOUNT');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'PAYTM';

-- AlterTable
ALTER TABLE "sale" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "discountReason" "DiscountReason" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "paytmTransactionId" TEXT,
ADD COLUMN     "transactionCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "credit_policy" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 0,
    "lateFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "penaltyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_policy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_policy_merchantId_key" ON "credit_policy"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_merchantId_invoiceNumber_key" ON "sale"("merchantId", "invoiceNumber");

-- AddForeignKey
ALTER TABLE "credit_policy" ADD CONSTRAINT "credit_policy_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

