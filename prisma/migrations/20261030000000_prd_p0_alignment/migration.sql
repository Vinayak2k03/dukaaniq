-- PRD P0 alignment: credit ledger, sale payment/amount fields, recommendation versioning,
-- approval decisions, audit events, idempotent import keys, action safety.
--
-- This migration drops/replaces columns and enums on tables that were unused after init.
-- Refuse to run if any of them already holds data, rather than silently destroying it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "sale")
     OR EXISTS (SELECT 1 FROM "sale_item")
     OR EXISTS (SELECT 1 FROM "recommendation")
     OR EXISTS (SELECT 1 FROM "action_log") THEN
    RAISE EXCEPTION 'prd_p0_alignment: sale, sale_item, recommendation or action_log already contains rows; migrate the data manually first';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('UPI', 'CASH', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'CREDIT', 'PENDING');

-- CreateEnum
CREATE TYPE "CreditEntryType" AS ENUM ('CREDIT_GIVEN', 'REPAYMENT_RECEIVED', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE');

-- CreateEnum
CREATE TYPE "ApprovalDecisionType" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DeclineReason" AS ENUM ('COST_TOO_HIGH', 'BENEFIT_UNCLEAR', 'WRONG_AUDIENCE', 'BAD_TIMING', 'OPERATIONAL_CONSTRAINT', 'DO_NOT_CONTACT', 'OTHER');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP_MANUAL_LINK', 'WHATSAPP_API', 'SMS', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('RECOMMENDATION_CREATED', 'RECOMMENDATION_VIEWED', 'APPROVED', 'REJECTED', 'FEEDBACK_SUBMITTED', 'ALTERNATIVE_CREATED', 'EXECUTION_REQUESTED', 'PROVIDER_RESPONSE', 'DELIVERY_STATUS_UPDATED', 'SIMULATED_ACTION_RECORDED', 'OUTCOME_RECORDED', 'CREDIT_GIVEN', 'REPAYMENT_RECEIVED', 'CREDIT_ADJUSTED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- AlterEnum
BEGIN;
CREATE TYPE "RecommendationType_new" AS ENUM ('WINBACK', 'BUNDLE', 'SLOW_MOVING', 'PEAK_TIMING', 'CREDIT_REMINDER', 'LOYALTY');
ALTER TABLE "recommendation" ALTER COLUMN "type" TYPE "RecommendationType_new" USING ("type"::text::"RecommendationType_new");
ALTER TYPE "RecommendationType" RENAME TO "RecommendationType_old";
ALTER TYPE "RecommendationType_new" RENAME TO "RecommendationType";
DROP TYPE "RecommendationType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "RecommendationStatus_new" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTION_PENDING', 'SENT', 'SIMULATED', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED');
ALTER TABLE "recommendation" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "recommendation" ALTER COLUMN "status" TYPE "RecommendationStatus_new" USING ("status"::text::"RecommendationStatus_new");
ALTER TYPE "RecommendationStatus" RENAME TO "RecommendationStatus_old";
ALTER TYPE "RecommendationStatus_new" RENAME TO "RecommendationStatus";
DROP TYPE "RecommendationStatus_old";
ALTER TABLE "recommendation" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "ActionStatus_new" AS ENUM ('PENDING', 'SIMULATED', 'SENT', 'DELIVERED', 'READ', 'FAILED');
ALTER TABLE "action_log" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "action_log" ALTER COLUMN "status" TYPE "ActionStatus_new" USING ("status"::text::"ActionStatus_new");
ALTER TYPE "ActionStatus" RENAME TO "ActionStatus_old";
ALTER TYPE "ActionStatus_new" RENAME TO "ActionStatus";
DROP TYPE "ActionStatus_old";
ALTER TABLE "action_log" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- DropForeignKey
ALTER TABLE "action_log" DROP CONSTRAINT "action_log_recommendationId_fkey";

-- DropIndex
DROP INDEX "action_log_recommendationId_idx";

-- AlterTable
ALTER TABLE "product" ADD COLUMN     "externalId" TEXT;

-- AlterTable
ALTER TABLE "sale" DROP COLUMN "totalAmount",
ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "grossAmount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "netAmount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL;

-- AlterTable
ALTER TABLE "sale_item" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "lineCost" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "lineDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lineTotal" DECIMAL(12,2) NOT NULL;

-- AlterTable
ALTER TABLE "recommendation" DROP COLUMN "explanation",
ADD COLUMN     "alternativeOfId" TEXT,
ADD COLUMN     "currentVersion" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "action_log" DROP COLUMN "recommendationId",
ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "channel" "MessageChannel" NOT NULL,
ADD COLUMN     "idempotencyKey" TEXT NOT NULL,
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "recommendationVersionId" TEXT NOT NULL,
ADD COLUMN     "simulated" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "credit_entry" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "CreditEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "paymentMethod" "PaymentMethod",
    "note" TEXT,
    "reason" TEXT,
    "reversesEntryId" TEXT,
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_version" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "offerTerms" JSONB NOT NULL,
    "economics" JSONB NOT NULL,
    "message" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_audience" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "lastPurchaseAt" TIMESTAMP(3),
    "daysSinceLastPurchase" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_audience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_decision" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "decision" "ApprovalDecisionType" NOT NULL,
    "declineReason" "DeclineReason",
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" "AuditEventType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityVersion" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_run" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT,
    "sourceLabel" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'RUNNING',
    "summary" JSONB,
    "errors" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "import_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_entry_merchantId_customerId_entryDate_idx" ON "credit_entry"("merchantId", "customerId", "entryDate");

-- CreateIndex
CREATE INDEX "credit_entry_merchantId_dueDate_idx" ON "credit_entry"("merchantId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "credit_entry_merchantId_idempotencyKey_key" ON "credit_entry"("merchantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_version_recommendationId_version_key" ON "recommendation_version"("recommendationId", "version");

-- CreateIndex
CREATE INDEX "recommendation_audience_customerId_idx" ON "recommendation_audience"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_audience_versionId_customerId_key" ON "recommendation_audience"("versionId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_decision_versionId_key" ON "approval_decision"("versionId");

-- CreateIndex
CREATE INDEX "approval_decision_merchantId_decidedAt_idx" ON "approval_decision"("merchantId", "decidedAt");

-- CreateIndex
CREATE INDEX "approval_decision_recommendationId_idx" ON "approval_decision"("recommendationId");

-- CreateIndex
CREATE INDEX "audit_event_merchantId_createdAt_idx" ON "audit_event"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_event_entityType_entityId_idx" ON "audit_event"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "import_run_merchantId_startedAt_idx" ON "import_run"("merchantId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_merchantId_externalId_key" ON "product"("merchantId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_merchantId_externalId_key" ON "sale"("merchantId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_item_saleId_externalId_key" ON "sale_item"("saleId", "externalId");

-- CreateIndex
CREATE INDEX "action_log_recommendationVersionId_idx" ON "action_log"("recommendationVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "action_log_merchantId_idempotencyKey_key" ON "action_log"("merchantId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "credit_entry" ADD CONSTRAINT "credit_entry_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entry" ADD CONSTRAINT "credit_entry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entry" ADD CONSTRAINT "credit_entry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entry" ADD CONSTRAINT "credit_entry_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "credit_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_alternativeOfId_fkey" FOREIGN KEY ("alternativeOfId") REFERENCES "recommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_version" ADD CONSTRAINT "recommendation_version_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_audience" ADD CONSTRAINT "recommendation_audience_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "recommendation_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_audience" ADD CONSTRAINT "recommendation_audience_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decision" ADD CONSTRAINT "approval_decision_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decision" ADD CONSTRAINT "approval_decision_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decision" ADD CONSTRAINT "approval_decision_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "recommendation_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decision" ADD CONSTRAINT "approval_decision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_log" ADD CONSTRAINT "action_log_recommendationVersionId_fkey" FOREIGN KEY ("recommendationVersionId") REFERENCES "recommendation_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_log" ADD CONSTRAINT "action_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_run" ADD CONSTRAINT "import_run_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Data integrity checks (Prisma cannot express CHECK constraints)
-- ---------------------------------------------------------------------------

ALTER TABLE "sale"
  ADD CONSTRAINT "sale_amounts_check"
  CHECK ("grossAmount" >= 0 AND "discountAmount" >= 0 AND "netAmount" >= 0
         AND "netAmount" = "grossAmount" - "discountAmount");

ALTER TABLE "sale_item"
  ADD CONSTRAINT "sale_item_values_check"
  CHECK ("quantity" > 0 AND "unitSellingPrice" >= 0 AND "unitCostPrice" >= 0
         AND "lineDiscount" >= 0 AND "lineTotal" >= 0 AND "lineCost" >= 0);

ALTER TABLE "product"
  ADD CONSTRAINT "product_prices_check"
  CHECK ("sellingPrice" >= 0 AND "costPrice" >= 0);

ALTER TABLE "credit_entry"
  ADD CONSTRAINT "credit_entry_amount_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "credit_entry_adjustment_reason_check"
  CHECK ("type" NOT IN ('ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE')
         OR ("reason" IS NOT NULL AND length(trim("reason")) > 0)),
  ADD CONSTRAINT "credit_entry_reversal_type_check"
  CHECK ("reversesEntryId" IS NULL OR "type" IN ('ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE'));

ALTER TABLE "approval_decision"
  ADD CONSTRAINT "approval_decision_reason_check"
  CHECK ("declineReason" IS NULL OR "decision" = 'REJECTED');

ALTER TABLE "recommendation_version"
  ADD CONSTRAINT "recommendation_version_version_check" CHECK ("version" >= 1);

-- ---------------------------------------------------------------------------
-- Append-only history (PRD 7.4, 8.4): no UPDATE or DELETE on ledger, audit, approvals.
-- ---------------------------------------------------------------------------

CREATE FUNCTION prevent_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: table is append-only', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "credit_entry_append_only"
  BEFORE UPDATE OR DELETE ON "credit_entry"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

CREATE TRIGGER "audit_event_append_only"
  BEFORE UPDATE OR DELETE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

CREATE TRIGGER "approval_decision_append_only"
  BEFORE UPDATE OR DELETE ON "approval_decision"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ---------------------------------------------------------------------------
-- Approval safety (PRD 2.3, 11.1)
-- ---------------------------------------------------------------------------

-- A decided version is frozen: terms, audience and message cannot change after a decision.
CREATE FUNCTION prevent_decided_version_change() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "approval_decision" WHERE "versionId" = OLD."id") THEN
    RAISE EXCEPTION 'recommendation_version % already has a decision; create a new version instead', OLD."id";
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "recommendation_version_frozen_after_decision"
  BEFORE UPDATE OR DELETE ON "recommendation_version"
  FOR EACH ROW EXECUTE FUNCTION prevent_decided_version_change();

-- An action can only be created for a version that the merchant approved.
CREATE FUNCTION require_approved_version() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "approval_decision"
    WHERE "versionId" = NEW."recommendationVersionId" AND "decision" = 'APPROVED'
  ) THEN
    RAISE EXCEPTION 'action_log requires an APPROVED decision for recommendation_version %', NEW."recommendationVersionId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "action_log_requires_approval"
  BEFORE INSERT ON "action_log"
  FOR EACH ROW EXECUTE FUNCTION require_approved_version();
