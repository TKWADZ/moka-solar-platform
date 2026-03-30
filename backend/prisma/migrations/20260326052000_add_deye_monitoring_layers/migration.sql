ALTER TABLE "SolarSystem"
ADD COLUMN IF NOT EXISTS "lastStationSyncAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastRealtimeSyncAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastDailySyncAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastHourlySyncAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastMonthlySyncAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastBillingSyncAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "DeyeTelemetryRecord" (
    "id" TEXT NOT NULL,
    "solarSystemId" TEXT NOT NULL,
    "deyeConnectionId" TEXT,
    "stationId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "generationPowerKw" DECIMAL(12,2),
    "generationValueKwh" DECIMAL(12,2),
    "consumptionPowerKw" DECIMAL(12,2),
    "consumptionValueKwh" DECIMAL(12,2),
    "purchasePowerKw" DECIMAL(12,2),
    "purchaseValueKwh" DECIMAL(12,2),
    "gridPowerKw" DECIMAL(12,2),
    "gridValueKwh" DECIMAL(12,2),
    "batteryPowerKw" DECIMAL(12,2),
    "batterySocPct" DECIMAL(12,2),
    "chargePowerKw" DECIMAL(12,2),
    "chargeValueKwh" DECIMAL(12,2),
    "dischargePowerKw" DECIMAL(12,2),
    "dischargeValueKwh" DECIMAL(12,2),
    "fullPowerHours" DECIMAL(12,2),
    "syncTime" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DeyeTelemetryRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DeyeDailyRecord" (
    "id" TEXT NOT NULL,
    "solarSystemId" TEXT NOT NULL,
    "deyeConnectionId" TEXT,
    "stationId" TEXT NOT NULL,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "generationValueKwh" DECIMAL(12,2),
    "consumptionValueKwh" DECIMAL(12,2),
    "purchaseValueKwh" DECIMAL(12,2),
    "gridValueKwh" DECIMAL(12,2),
    "batterySocPct" DECIMAL(12,2),
    "fullPowerHours" DECIMAL(12,2),
    "syncTime" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DeyeDailyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeyeTelemetryRecord_stationId_recordedAt_key"
ON "DeyeTelemetryRecord"("stationId", "recordedAt");

CREATE INDEX IF NOT EXISTS "DeyeTelemetryRecord_solarSystemId_recordedAt_idx"
ON "DeyeTelemetryRecord"("solarSystemId", "recordedAt");

CREATE INDEX IF NOT EXISTS "DeyeTelemetryRecord_deyeConnectionId_recordedAt_idx"
ON "DeyeTelemetryRecord"("deyeConnectionId", "recordedAt");

CREATE INDEX IF NOT EXISTS "DeyeTelemetryRecord_deletedAt_idx"
ON "DeyeTelemetryRecord"("deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "DeyeDailyRecord_stationId_recordDate_key"
ON "DeyeDailyRecord"("stationId", "recordDate");

CREATE INDEX IF NOT EXISTS "DeyeDailyRecord_solarSystemId_recordDate_idx"
ON "DeyeDailyRecord"("solarSystemId", "recordDate");

CREATE INDEX IF NOT EXISTS "DeyeDailyRecord_deyeConnectionId_recordDate_idx"
ON "DeyeDailyRecord"("deyeConnectionId", "recordDate");

CREATE INDEX IF NOT EXISTS "DeyeDailyRecord_deletedAt_idx"
ON "DeyeDailyRecord"("deletedAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'DeyeTelemetryRecord_solarSystemId_fkey'
    ) THEN
        ALTER TABLE "DeyeTelemetryRecord"
        ADD CONSTRAINT "DeyeTelemetryRecord_solarSystemId_fkey"
        FOREIGN KEY ("solarSystemId") REFERENCES "SolarSystem"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'DeyeTelemetryRecord_deyeConnectionId_fkey'
    ) THEN
        ALTER TABLE "DeyeTelemetryRecord"
        ADD CONSTRAINT "DeyeTelemetryRecord_deyeConnectionId_fkey"
        FOREIGN KEY ("deyeConnectionId") REFERENCES "DeyeConnection"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'DeyeDailyRecord_solarSystemId_fkey'
    ) THEN
        ALTER TABLE "DeyeDailyRecord"
        ADD CONSTRAINT "DeyeDailyRecord_solarSystemId_fkey"
        FOREIGN KEY ("solarSystemId") REFERENCES "SolarSystem"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'DeyeDailyRecord_deyeConnectionId_fkey'
    ) THEN
        ALTER TABLE "DeyeDailyRecord"
        ADD CONSTRAINT "DeyeDailyRecord_deyeConnectionId_fkey"
        FOREIGN KEY ("deyeConnectionId") REFERENCES "DeyeConnection"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
