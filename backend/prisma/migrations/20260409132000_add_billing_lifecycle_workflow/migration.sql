ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';

CREATE TYPE "BillingSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'RETRYING', 'ERROR', 'MANUAL_OVERRIDE');
CREATE TYPE "BillingDataQualityStatus" AS ENUM ('UNKNOWN', 'IN_PROGRESS', 'OK', 'INCOMPLETE', 'UNSTABLE_SOURCE', 'ERROR', 'MANUAL_OVERRIDE');
CREATE TYPE "BillingWorkflowStatus" AS ENUM ('ESTIMATE', 'DRAFT', 'PENDING_REVIEW', 'ISSUED', 'PAID', 'PARTIAL', 'OVERDUE', 'CANCELLED');

ALTER TABLE "MonthlyPvBilling"
ADD COLUMN "syncStatus" "BillingSyncStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "dataQualityStatus" "BillingDataQualityStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "invoiceStatus" "BillingWorkflowStatus" NOT NULL DEFAULT 'ESTIMATE',
ADD COLUMN "expectedDayCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "availableDayCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "missingDayCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "dataSourceStable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "autoSendEligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "qualitySummary" TEXT,
ADD COLUMN "lastAutoRetriedAt" TIMESTAMP(3),
ADD COLUMN "lastQualityCheckedAt" TIMESTAMP(3),
ADD COLUMN "finalizedAt" TIMESTAMP(3),
ADD COLUMN "manualOverrideKwh" DECIMAL(12,2),
ADD COLUMN "manualOverrideReason" TEXT,
ADD COLUMN "manualOverrideAt" TIMESTAMP(3),
ADD COLUMN "manualOverrideByUserId" TEXT;

UPDATE "MonthlyPvBilling"
SET
  "syncStatus" = 'SYNCED',
  "dataQualityStatus" = CASE
    WHEN "invoiceId" IS NOT NULL THEN 'OK'::"BillingDataQualityStatus"
    WHEN "source" = 'MANUAL' THEN 'MANUAL_OVERRIDE'::"BillingDataQualityStatus"
    ELSE 'UNKNOWN'::"BillingDataQualityStatus"
  END,
  "invoiceStatus" = CASE
    WHEN "invoiceId" IS NULL THEN 'ESTIMATE'::"BillingWorkflowStatus"
    ELSE 'ISSUED'::"BillingWorkflowStatus"
  END;

ALTER TABLE "MonthlyPvBilling"
ADD CONSTRAINT "MonthlyPvBilling_manualOverrideByUserId_fkey"
FOREIGN KEY ("manualOverrideByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MonthlyPvBilling_manualOverrideByUserId_idx" ON "MonthlyPvBilling"("manualOverrideByUserId");
CREATE INDEX "MonthlyPvBilling_syncStatus_dataQualityStatus_invoiceStatus_idx" ON "MonthlyPvBilling"("syncStatus", "dataQualityStatus", "invoiceStatus");
