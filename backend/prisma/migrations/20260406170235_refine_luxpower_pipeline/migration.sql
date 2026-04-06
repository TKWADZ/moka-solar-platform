-- CreateEnum
CREATE TYPE "LuxPowerMetricGranularity" AS ENUM ('REALTIME', 'DAILY', 'MONTHLY', 'YEARLY', 'TOTAL');

-- CreateEnum
CREATE TYPE "LuxPowerSnapshotType" AS ENUM ('AUTH', 'PLANT_LIST', 'PLANT_DETAIL', 'REALTIME_RUNTIME', 'REALTIME_ENERGY', 'DAY_CHART', 'MONTH_CHART', 'YEAR_CHART', 'TOTAL_CHART', 'NORMALIZED_REALTIME', 'NORMALIZED_DAILY', 'NORMALIZED_MONTHLY', 'NORMALIZED_YEARLY', 'NORMALIZED_TOTAL');

-- AlterTable
ALTER TABLE "LuxPowerConnection" ADD COLUMN     "authReadyAt" TIMESTAMP(3),
ADD COLUMN     "billingReadyAt" TIMESTAMP(3),
ADD COLUMN     "billingRuleLabel" TEXT,
ADD COLUMN     "contractId" TEXT,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "metricsAvailableAt" TIMESTAMP(3),
ADD COLUMN     "plantLinkedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LuxPowerDebugSnapshot" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "solarSystemId" TEXT,
    "snapshotType" "LuxPowerSnapshotType" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CAPTURED',
    "providerPlantId" TEXT,
    "providerDeviceSn" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LuxPowerDebugSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LuxPowerNormalizedMetric" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "solarSystemId" TEXT,
    "provider" TEXT NOT NULL,
    "providerPlantId" TEXT,
    "providerDeviceSn" TEXT,
    "granularity" "LuxPowerMetricGranularity" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "metricDate" TIMESTAMP(3),
    "year" INTEGER,
    "month" INTEGER,
    "pvPowerW" DECIMAL(12,2),
    "loadPowerW" DECIMAL(12,2),
    "gridPowerW" DECIMAL(12,2),
    "batteryPowerW" DECIMAL(12,2),
    "batterySocPercent" DECIMAL(8,2),
    "acCouplePowerW" DECIMAL(12,2),
    "currentPvPowerKw" DECIMAL(12,2),
    "currentLoadPowerKw" DECIMAL(12,2),
    "currentBatterySoc" DECIMAL(8,2),
    "dailyInverterOutputKwh" DECIMAL(12,2),
    "dailyToUserKwh" DECIMAL(12,2),
    "dailyConsumptionKwh" DECIMAL(12,2),
    "monthlyInverterOutputKwh" DECIMAL(12,2),
    "monthlyToUserKwh" DECIMAL(12,2),
    "monthlyConsumptionKwh" DECIMAL(12,2),
    "dailyPvKwh" DECIMAL(12,2),
    "monthlyPvKwh" DECIMAL(12,2),
    "totalPvKwh" DECIMAL(14,2),
    "gridImportKwh" DECIMAL(12,2),
    "gridExportKwh" DECIMAL(12,2),
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LuxPowerNormalizedMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LuxPowerDebugSnapshot_connectionId_snapshotType_capturedAt_idx" ON "LuxPowerDebugSnapshot"("connectionId", "snapshotType", "capturedAt");

-- CreateIndex
CREATE INDEX "LuxPowerDebugSnapshot_solarSystemId_capturedAt_idx" ON "LuxPowerDebugSnapshot"("solarSystemId", "capturedAt");

-- CreateIndex
CREATE INDEX "LuxPowerDebugSnapshot_providerPlantId_providerDeviceSn_idx" ON "LuxPowerDebugSnapshot"("providerPlantId", "providerDeviceSn");

-- CreateIndex
CREATE INDEX "LuxPowerNormalizedMetric_solarSystemId_granularity_captured_idx" ON "LuxPowerNormalizedMetric"("solarSystemId", "granularity", "capturedAt");

-- CreateIndex
CREATE INDEX "LuxPowerNormalizedMetric_providerPlantId_providerDeviceSn_g_idx" ON "LuxPowerNormalizedMetric"("providerPlantId", "providerDeviceSn", "granularity");

-- CreateIndex
CREATE UNIQUE INDEX "LuxPowerNormalizedMetric_connectionId_granularity_periodKey_key" ON "LuxPowerNormalizedMetric"("connectionId", "granularity", "periodKey");

-- CreateIndex
CREATE INDEX "LuxPowerConnection_customerId_idx" ON "LuxPowerConnection"("customerId");

-- CreateIndex
CREATE INDEX "LuxPowerConnection_contractId_idx" ON "LuxPowerConnection"("contractId");

-- AddForeignKey
ALTER TABLE "LuxPowerConnection" ADD CONSTRAINT "LuxPowerConnection_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LuxPowerConnection" ADD CONSTRAINT "LuxPowerConnection_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LuxPowerDebugSnapshot" ADD CONSTRAINT "LuxPowerDebugSnapshot_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "LuxPowerConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LuxPowerDebugSnapshot" ADD CONSTRAINT "LuxPowerDebugSnapshot_solarSystemId_fkey" FOREIGN KEY ("solarSystemId") REFERENCES "SolarSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LuxPowerNormalizedMetric" ADD CONSTRAINT "LuxPowerNormalizedMetric_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "LuxPowerConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LuxPowerNormalizedMetric" ADD CONSTRAINT "LuxPowerNormalizedMetric_solarSystemId_fkey" FOREIGN KEY ("solarSystemId") REFERENCES "SolarSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
