-- AlterTable
ALTER TABLE "SolarmanConnection"
ADD COLUMN     "providerType" TEXT NOT NULL DEFAULT 'COOKIE_SESSION',
ADD COLUMN     "cookieJarEncrypted" TEXT,
ADD COLUMN     "lastAuthAt" TIMESTAMP(3),
ADD COLUMN     "lastSuccessfulSyncAt" TIMESTAMP(3),
ADD COLUMN     "lastErrorCode" TEXT,
ADD COLUMN     "lastErrorMessage" TEXT,
ADD COLUMN     "lastErrorDetails" JSONB,
ADD COLUMN     "providerMetadata" JSONB;

-- AlterTable
ALTER TABLE "SolarmanSyncLog"
ADD COLUMN     "providerType" TEXT,
ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "responsePayload" JSONB;

-- CreateTable
CREATE TABLE "SolarmanDebugSnapshot" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "solarSystemId" TEXT,
    "stationId" TEXT,
    "deviceSn" TEXT,
    "providerType" TEXT NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CAPTURED',
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolarmanDebugSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SolarmanDebugSnapshot_connectionId_snapshotType_capturedAt_idx" ON "SolarmanDebugSnapshot"("connectionId", "snapshotType", "capturedAt");

-- CreateIndex
CREATE INDEX "SolarmanDebugSnapshot_solarSystemId_capturedAt_idx" ON "SolarmanDebugSnapshot"("solarSystemId", "capturedAt");

-- CreateIndex
CREATE INDEX "SolarmanDebugSnapshot_stationId_deviceSn_capturedAt_idx" ON "SolarmanDebugSnapshot"("stationId", "deviceSn", "capturedAt");

-- AddForeignKey
ALTER TABLE "SolarmanDebugSnapshot" ADD CONSTRAINT "SolarmanDebugSnapshot_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SolarmanConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolarmanDebugSnapshot" ADD CONSTRAINT "SolarmanDebugSnapshot_solarSystemId_fkey" FOREIGN KEY ("solarSystemId") REFERENCES "SolarSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
