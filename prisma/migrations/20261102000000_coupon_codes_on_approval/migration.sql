-- CreateTable
CREATE TABLE "coupon_code" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "recommendationVersionId" TEXT NOT NULL,
    "customerId" TEXT,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coupon_code_recommendationVersionId_idx" ON "coupon_code"("recommendationVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_code_merchantId_code_key" ON "coupon_code"("merchantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_code_recommendationVersionId_customerId_key" ON "coupon_code"("recommendationVersionId", "customerId");

-- AddForeignKey
ALTER TABLE "coupon_code" ADD CONSTRAINT "coupon_code_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_code" ADD CONSTRAINT "coupon_code_recommendationVersionId_fkey" FOREIGN KEY ("recommendationVersionId") REFERENCES "recommendation_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_code" ADD CONSTRAINT "coupon_code_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- At most one shared (customerId NULL) code per approved version; the unique index above treats NULLs as distinct.
CREATE UNIQUE INDEX "coupon_code_one_shared_per_version" ON "coupon_code"("recommendationVersionId") WHERE "customerId" IS NULL;
