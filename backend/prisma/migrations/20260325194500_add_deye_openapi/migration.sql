-- DropForeignKey
ALTER TABLE "SolarSystem" DROP CONSTRAINT "SolarSystem_customerId_fkey";

-- DropForeignKey
ALTER TABLE "MonthlyEnergyRecord" DROP CONSTRAINT "MonthlyEnergyRecord_customerId_fkey";

-- DropIndex
DROP INDEX "SolarSystem_stationId_key";

-- AlterTable
ALTER TABLE "Customer"
ADD COLUMN "defaultDiscountAmount" DECIMAL(12,2),
ADD COLUMN "defaultTaxAmount" DECIMAL(12,2),
ADD COLUMN "defaultUnitPrice" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "SolarSystem"
ADD COLUMN "deyeConnectionId" TEXT,
ADD COLUMN "gridInterconnectionType" TEXT,
ADD COLUMN "latitude" DECIMAL(10,6),
ADD COLUMN "locationAddress" TEXT,
ADD COLUMN "longitude" DECIMAL(10,6),
ADD COLUMN "ownerName" TEXT,
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "stationType" TEXT,
ALTER COLUMN "customerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MonthlyEnergyRecord"
ADD COLUMN "deyeConnectionId" TEXT,
ALTER COLUMN "customerId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "DeyeConnection" (
    "id" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "appSecretEncrypted" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenType" TEXT,
    "expiresIn" INTEGER,
    "tokenExpiredAt" TIMESTAMP(3),
    "uid" INTEGER,
    "companyId" INTEGER,
    "companyName" TEXT,
    "roleName" TEXT,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastSyncTime" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DeyeConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "connectionId" TEXT,
    "stationId" TEXT NOT NULL,
    "deviceId" TEXT,
    "deviceSn" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "productId" TEXT,
    "connectStatus" TEXT,
    "collectionTime" BIGINT,
    "externalPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "connectionId" TEXT,
    "syncType" TEXT NOT NULL,
    "targetStationId" TEXT,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeyeConnection_customerId_idx" ON "DeyeConnection"("customerId");
CREATE INDEX "DeyeConnection_status_idx" ON "DeyeConnection"("status");
CREATE INDEX "DeyeConnection_deletedAt_idx" ON "DeyeConnection"("deletedAt");

-- CreateIndex
CREATE INDEX "Device_systemId_idx" ON "Device"("systemId");
CREATE INDEX "Device_connectionId_idx" ON "Device"("connectionId");
CREATE INDEX "Device_stationId_idx" ON "Device"("stationId");
CREATE INDEX "Device_deletedAt_idx" ON "Device"("deletedAt");
CREATE UNIQUE INDEX "Device_stationId_deviceSn_key" ON "Device"("stationId", "deviceSn");

-- CreateIndex
CREATE INDEX "SyncLog_source_createdAt_idx" ON "SyncLog"("source", "createdAt");
CREATE INDEX "SyncLog_connectionId_createdAt_idx" ON "SyncLog"("connectionId", "createdAt");
CREATE INDEX "SyncLog_status_idx" ON "SyncLog"("status");
CREATE INDEX "SyncLog_syncType_idx" ON "SyncLog"("syncType");
CREATE INDEX "SyncLog_targetStationId_idx" ON "SyncLog"("targetStationId");

-- CreateIndex
CREATE INDEX "SolarSystem_deyeConnectionId_idx" ON "SolarSystem"("deyeConnectionId");
CREATE UNIQUE INDEX "SolarSystem_sourceSystem_stationId_key" ON "SolarSystem"("sourceSystem", "stationId");

-- CreateIndex
CREATE INDEX "MonthlyEnergyRecord_deyeConnectionId_idx" ON "MonthlyEnergyRecord"("deyeConnectionId");
CREATE UNIQUE INDEX "MonthlyEnergyRecord_source_stationId_year_month_key" ON "MonthlyEnergyRecord"("source", "stationId", "year", "month");

-- AddForeignKey
ALTER TABLE "SolarSystem"
ADD CONSTRAINT "SolarSystem_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolarSystem"
ADD CONSTRAINT "SolarSystem_deyeConnectionId_fkey"
FOREIGN KEY ("deyeConnectionId") REFERENCES "DeyeConnection"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeyeConnection"
ADD CONSTRAINT "DeyeConnection_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device"
ADD CONSTRAINT "Device_systemId_fkey"
FOREIGN KEY ("systemId") REFERENCES "SolarSystem"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device"
ADD CONSTRAINT "Device_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "DeyeConnection"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyEnergyRecord"
ADD CONSTRAINT "MonthlyEnergyRecord_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyEnergyRecord"
ADD CONSTRAINT "MonthlyEnergyRecord_deyeConnectionId_fkey"
FOREIGN KEY ("deyeConnectionId") REFERENCES "DeyeConnection"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog"
ADD CONSTRAINT "SyncLog_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "DeyeConnection"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
