-- CreateTable
CREATE TABLE "LuxPowerConnection" (
    "id" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "username" TEXT,
    "passwordEncrypted" TEXT,
    "plantId" TEXT,
    "inverterSerial" TEXT,
    "solarSystemId" TEXT,
    "pollingIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "useDemoMode" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastLoginAt" TIMESTAMP(3),
    "lastSyncTime" TIMESTAMP(3),
    "lastError" TEXT,
    "lastProviderResponse" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LuxPowerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LuxPowerSyncLog" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "providerCode" TEXT,
    "context" JSONB,
    "responsePayload" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LuxPowerSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LuxPowerConnection_solarSystemId_key" ON "LuxPowerConnection"("solarSystemId");

-- CreateIndex
CREATE INDEX "LuxPowerConnection_solarSystemId_idx" ON "LuxPowerConnection"("solarSystemId");

-- CreateIndex
CREATE INDEX "LuxPowerConnection_status_idx" ON "LuxPowerConnection"("status");

-- CreateIndex
CREATE INDEX "LuxPowerConnection_deletedAt_idx" ON "LuxPowerConnection"("deletedAt");

-- CreateIndex
CREATE INDEX "LuxPowerSyncLog_connectionId_createdAt_idx" ON "LuxPowerSyncLog"("connectionId", "createdAt");

-- CreateIndex
CREATE INDEX "LuxPowerSyncLog_status_createdAt_idx" ON "LuxPowerSyncLog"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "LuxPowerConnection" ADD CONSTRAINT "LuxPowerConnection_solarSystemId_fkey" FOREIGN KEY ("solarSystemId") REFERENCES "SolarSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LuxPowerSyncLog" ADD CONSTRAINT "LuxPowerSyncLog_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "LuxPowerConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
