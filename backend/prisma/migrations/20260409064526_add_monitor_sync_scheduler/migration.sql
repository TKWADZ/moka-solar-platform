-- AlterTable
ALTER TABLE "SolarSystem" ADD COLUMN     "lastSuccessfulSyncAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncAttemptAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncErrorAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncErrorMessage" TEXT,
ADD COLUMN     "lastSyncErrorStatus" TEXT,
ADD COLUMN     "lastSyncStatus" TEXT,
ADD COLUMN     "nextHistorySyncAt" TIMESTAMP(3),
ADD COLUMN     "nextRealtimeSyncAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SystemRealtimeMetric" (
    "id" TEXT NOT NULL,
    "solarSystemId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "pvPowerKw" DECIMAL(12,3),
    "loadPowerKw" DECIMAL(12,3),
    "gridPowerKw" DECIMAL(12,3),
    "batteryPowerKw" DECIMAL(12,3),
    "batterySocPct" DECIMAL(5,2),
    "inverterStatus" TEXT,
    "sourceSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemRealtimeMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemMonitorSyncLog" (
    "id" TEXT NOT NULL,
    "solarSystemId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "syncScope" TEXT NOT NULL,
    "scheduleTier" TEXT,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "message" TEXT,
    "errorStatus" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemMonitorSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemDashboardPresence" (
    "id" TEXT NOT NULL,
    "solarSystemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "roleCode" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemDashboardPresence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemRealtimeMetric_solarSystemId_capturedAt_idx" ON "SystemRealtimeMetric"("solarSystemId", "capturedAt");

-- CreateIndex
CREATE INDEX "SystemRealtimeMetric_capturedAt_idx" ON "SystemRealtimeMetric"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemRealtimeMetric_solarSystemId_capturedAt_key" ON "SystemRealtimeMetric"("solarSystemId", "capturedAt");

-- CreateIndex
CREATE INDEX "SystemMonitorSyncLog_solarSystemId_createdAt_idx" ON "SystemMonitorSyncLog"("solarSystemId", "createdAt");

-- CreateIndex
CREATE INDEX "SystemMonitorSyncLog_provider_syncScope_createdAt_idx" ON "SystemMonitorSyncLog"("provider", "syncScope", "createdAt");

-- CreateIndex
CREATE INDEX "SystemMonitorSyncLog_status_createdAt_idx" ON "SystemMonitorSyncLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SystemDashboardPresence_solarSystemId_expiresAt_idx" ON "SystemDashboardPresence"("solarSystemId", "expiresAt");

-- CreateIndex
CREATE INDEX "SystemDashboardPresence_userId_expiresAt_idx" ON "SystemDashboardPresence"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "SystemDashboardPresence_expiresAt_idx" ON "SystemDashboardPresence"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemDashboardPresence_solarSystemId_userId_pageKey_key" ON "SystemDashboardPresence"("solarSystemId", "userId", "pageKey");

-- AddForeignKey
ALTER TABLE "SystemRealtimeMetric" ADD CONSTRAINT "SystemRealtimeMetric_solarSystemId_fkey" FOREIGN KEY ("solarSystemId") REFERENCES "SolarSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemMonitorSyncLog" ADD CONSTRAINT "SystemMonitorSyncLog_solarSystemId_fkey" FOREIGN KEY ("solarSystemId") REFERENCES "SolarSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemDashboardPresence" ADD CONSTRAINT "SystemDashboardPresence_solarSystemId_fkey" FOREIGN KEY ("solarSystemId") REFERENCES "SolarSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemDashboardPresence" ADD CONSTRAINT "SystemDashboardPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
