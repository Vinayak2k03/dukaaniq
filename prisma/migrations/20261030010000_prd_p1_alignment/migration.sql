-- PRD P1 alignment: customer contact/consent, merchant demo flag, product category,
-- database-enforced merchant isolation (composite foreign keys), query indexes,
-- in-app notifications, outbound message log and verified outcome events.
--
-- Composite foreign keys use NO ACTION (not SET NULL / RESTRICT): sale history is no longer
-- silently orphaned when a customer is deleted, and merchant cascade deletes still work.
-- Existing rows are checked by the new foreign keys; the migration fails if any row
-- references a different merchant's customer or product.

-- CreateEnum
CREATE TYPE "PreferredLanguage" AS ENUM ('HINDI', 'HINGLISH', 'ENGLISH');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_INSIGHT', 'APPROVAL_PENDING', 'OVERDUE_CREDIT', 'EXECUTION_FAILED', 'OUTCOME_UPDATE');

-- CreateEnum
CREATE TYPE "OutcomeType" AS ENUM ('OFFER_REDEEMED', 'CUSTOMER_RETURNED', 'REPAYMENT_RECORDED', 'MESSAGE_DELIVERED', 'MESSAGE_READ');

-- DropForeignKey
ALTER TABLE "sale" DROP CONSTRAINT "sale_customerId_fkey";

-- DropForeignKey
ALTER TABLE "sale_item" DROP CONSTRAINT "sale_item_saleId_fkey";

-- DropForeignKey
ALTER TABLE "sale_item" DROP CONSTRAINT "sale_item_productId_fkey";

-- DropForeignKey
ALTER TABLE "credit_entry" DROP CONSTRAINT "credit_entry_customerId_fkey";

-- DropForeignKey
ALTER TABLE "approval_decision" DROP CONSTRAINT "approval_decision_recommendationId_fkey";

-- AlterTable
ALTER TABLE "merchant" ADD COLUMN     "city" TEXT,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "joinedAt" TIMESTAMP(3),
ADD COLUMN     "optedInAt" TIMESTAMP(3),
ADD COLUMN     "optedOutAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "preferredLanguage" "PreferredLanguage" NOT NULL DEFAULT 'ENGLISH';

-- AlterTable
ALTER TABLE "product" ADD COLUMN     "category" TEXT;

-- AlterTable
ALTER TABLE "sale_item" ADD COLUMN     "merchantId" TEXT;

-- Backfill from the parent sale, then make it required.
UPDATE "sale_item" SET "merchantId" = "sale"."merchantId" FROM "sale" WHERE "sale"."id" = "sale_item"."saleId";

ALTER TABLE "sale_item" ALTER COLUMN "merchantId" SET NOT NULL;

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_message" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "actionLogId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "copy" TEXT NOT NULL,
    "templateId" TEXT,
    "status" "ActionStatus" NOT NULL DEFAULT 'PENDING',
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "providerMessageId" TEXT,
    "providerResponse" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outcome_event" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" "OutcomeType" NOT NULL,
    "recommendationVersionId" TEXT,
    "actionLogId" TEXT,
    "customerId" TEXT,
    "saleId" TEXT,
    "amount" DECIMAL(12,2),
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outcome_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_merchantId_readAt_createdAt_idx" ON "notification"("merchantId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "outbound_message_actionLogId_idx" ON "outbound_message"("actionLogId");

-- CreateIndex
CREATE INDEX "outbound_message_customerId_idx" ON "outbound_message"("customerId");

-- CreateIndex
CREATE INDEX "outbound_message_providerMessageId_idx" ON "outbound_message"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_message_merchantId_idempotencyKey_key" ON "outbound_message"("merchantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "outcome_event_merchantId_occurredAt_idx" ON "outcome_event"("merchantId", "occurredAt");

-- CreateIndex
CREATE INDEX "outcome_event_recommendationVersionId_idx" ON "outcome_event"("recommendationVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_id_merchantId_key" ON "customer"("id", "merchantId");

-- CreateIndex
CREATE INDEX "product_merchantId_category_idx" ON "product"("merchantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "product_id_merchantId_key" ON "product"("id", "merchantId");

-- CreateIndex
CREATE INDEX "sale_merchantId_customerId_saleDate_idx" ON "sale"("merchantId", "customerId", "saleDate");

-- CreateIndex
CREATE INDEX "sale_merchantId_paymentStatus_saleDate_idx" ON "sale"("merchantId", "paymentStatus", "saleDate");

-- CreateIndex
CREATE UNIQUE INDEX "sale_id_merchantId_key" ON "sale"("id", "merchantId");

-- CreateIndex
CREATE INDEX "sale_item_merchantId_idx" ON "sale_item"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_id_merchantId_key" ON "recommendation"("id", "merchantId");

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_customerId_merchantId_fkey" FOREIGN KEY ("customerId", "merchantId") REFERENCES "customer"("id", "merchantId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item" ADD CONSTRAINT "sale_item_saleId_merchantId_fkey" FOREIGN KEY ("saleId", "merchantId") REFERENCES "sale"("id", "merchantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item" ADD CONSTRAINT "sale_item_productId_merchantId_fkey" FOREIGN KEY ("productId", "merchantId") REFERENCES "product"("id", "merchantId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entry" ADD CONSTRAINT "credit_entry_customerId_merchantId_fkey" FOREIGN KEY ("customerId", "merchantId") REFERENCES "customer"("id", "merchantId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decision" ADD CONSTRAINT "approval_decision_recommendationId_merchantId_fkey" FOREIGN KEY ("recommendationId", "merchantId") REFERENCES "recommendation"("id", "merchantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_message" ADD CONSTRAINT "outbound_message_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_message" ADD CONSTRAINT "outbound_message_actionLogId_fkey" FOREIGN KEY ("actionLogId") REFERENCES "action_log"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_message" ADD CONSTRAINT "outbound_message_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_event" ADD CONSTRAINT "outcome_event_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_event" ADD CONSTRAINT "outcome_event_recommendationVersionId_fkey" FOREIGN KEY ("recommendationVersionId") REFERENCES "recommendation_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_event" ADD CONSTRAINT "outcome_event_actionLogId_fkey" FOREIGN KEY ("actionLogId") REFERENCES "action_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_event" ADD CONSTRAINT "outcome_event_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_event" ADD CONSTRAINT "outcome_event_saleId_merchantId_fkey" FOREIGN KEY ("saleId", "merchantId") REFERENCES "sale"("id", "merchantId") ON DELETE NO ACTION ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Consent safety (PRD 9.3, 14): real (non-simulated) sends only to opted-in,
-- non-synthetic customers. Synthetic phone numbers can never receive a real message.
-- ---------------------------------------------------------------------------

CREATE FUNCTION require_consented_recipient() RETURNS trigger AS $$
DECLARE
  c "customer"%ROWTYPE;
BEGIN
  IF NEW."simulated" THEN
    RETURN NEW;
  END IF;
  SELECT * INTO c FROM "customer" WHERE "id" = NEW."customerId";
  IF c."isSynthetic" THEN
    RAISE EXCEPTION 'outbound_message: customer % is synthetic; only simulated messages are allowed', c."id";
  END IF;
  IF c."optedInAt" IS NULL OR c."optedOutAt" IS NOT NULL THEN
    RAISE EXCEPTION 'outbound_message: customer % has not opted in (or has opted out)', c."id";
  END IF;
  IF c."phone" IS NULL OR length(trim(c."phone")) = 0 THEN
    RAISE EXCEPTION 'outbound_message: customer % has no phone number', c."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "outbound_message_requires_consent"
  BEFORE INSERT ON "outbound_message"
  FOR EACH ROW EXECUTE FUNCTION require_consented_recipient();

ALTER TABLE "customer"
  ADD CONSTRAINT "customer_optout_after_optin_check"
  CHECK ("optedOutAt" IS NULL OR "optedInAt" IS NULL OR "optedOutAt" >= "optedInAt");

ALTER TABLE "outcome_event"
  ADD CONSTRAINT "outcome_event_amount_check" CHECK ("amount" IS NULL OR "amount" >= 0);
