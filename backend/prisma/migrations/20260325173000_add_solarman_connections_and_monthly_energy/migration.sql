-- AlterTable
ALTER TABLE "SolarSystem"
ADD COLUMN "installedCapacityKwp" DECIMAL(10,2),
ADD COLUMN "stationId" TEXT,
ADD COLUMN "stationName" TEXT,
ADD COLUMN "sourceSystem" TEXT,
ADD COLUMN "hasBattery" BOOLEAN,
ADD COLUMN "timeZone" TEXT,
ADD COLUMN "externalPayload" JSONB,
ADD COLUMN "currentMonthGenerationKwh" DECIMAL(12,2),
ADD COLUMN "currentYearGenerationKwh" DECIMAL(12,2),
ADD COLUMN "totalGenerationKwh" DECIMAL(12,2),
ADD COLUMN "currentGenerationPowerKw" DECIMAL(12,2),
ADD COLUMN "defaultUnitPrice" DECIMAL(12,2),
ADD COLUMN "defaultTaxAmount" DECIMAL(12,2),
ADD COLUMN "defaultDiscountAmount" DECIMAL(12,2),
ADD COLUMN "solarmanConnectionId" TEXT;

-- CreateTable
CREATE TABLE "SolarmanConnection" (
  "id" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "usernameOrEmail" TEXT NOT NULL,
  "passwordEncrypted" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "cookieJar" JSONB,
  "customerId" TEXT,
  "defaultUnitPrice" DECIMAL(12,2),
  "defaultTaxAmount" DECIMAL(12,2),
  "defaultDiscountAmount" DECIMAL(12,2),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastSyncTime" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "SolarmanConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyEnergyRecord" (
  "id" TEXT NOT NULL,
  "solarSystemId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "connectionId" TEXT,
  "stationId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "pvGenerationKwh" DECIMAL(12,2) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "subtotalAmount" DECIMAL(12,2) NOT NULL,
  "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(12,2) NOT NULL,
  "source" TEXT NOT NULL,
  "syncTime" TIMESTAMP(3) NOT NULL,
  "rawPayload" JSONB,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "MonthlyEnergyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolarmanSyncLog" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "context" JSONB,
  "syncedStations" INTEGER NOT NULL DEFAULT 0,
  "syncedMonths" INTEGER NOT NULL DEFAULT 0,
  "syncedBillings" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SolarmanSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SolarSystem_stationId_key" ON "SolarSystem"("stationId");

-- CreateIndex
CREATE INDEX "SolarSystem_solarmanConnectionId_idx" ON "SolarSystem"("solarmanConnectionId");

-- CreateIndex
CREATE INDEX "SolarmanConnection_customerId_idx" ON "SolarmanConnection"("customerId");
CREATE INDEX "SolarmanConnection_status_idx" ON "SolarmanConnection"("status");
CREATE INDEX "SolarmanConnection_deletedAt_idx" ON "SolarmanConnection"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyEnergyRecord_solarSystemId_year_month_key" ON "MonthlyEnergyRecord"("solarSystemId", "year", "month");
CREATE INDEX "MonthlyEnergyRecord_stationId_year_month_idx" ON "MonthlyEnergyRecord"("stationId", "year", "month");
CREATE INDEX "MonthlyEnergyRecord_customerId_year_month_idx" ON "MonthlyEnergyRecord"("customerId", "year", "month");
CREATE INDEX "MonthlyEnergyRecord_connectionId_idx" ON "MonthlyEnergyRecord"("connectionId");
CREATE INDEX "MonthlyEnergyRecord_deletedAt_idx" ON "MonthlyEnergyRecord"("deletedAt");

-- CreateIndex
CREATE INDEX "SolarmanSyncLog_connectionId_createdAt_idx" ON "SolarmanSyncLog"("connectionId", "createdAt");
CREATE INDEX "SolarmanSyncLog_status_idx" ON "SolarmanSyncLog"("status");

-- AddForeignKey
ALTER TABLE "SolarSystem"
ADD CONSTRAINT "SolarSystem_solarmanConnectionId_fkey"
FOREIGN KEY ("solarmanConnectionId") REFERENCES "SolarmanConnection"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolarmanConnection"
ADD CONSTRAINT "SolarmanConnection_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyEnergyRecord"
ADD CONSTRAINT "MonthlyEnergyRecord_solarSystemId_fkey"
FOREIGN KEY ("solarSystemId") REFERENCES "SolarSystem"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MonthlyEnergyRecord"
ADD CONSTRAINT "MonthlyEnergyRecord_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MonthlyEnergyRecord"
ADD CONSTRAINT "MonthlyEnergyRecord_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "SolarmanConnection"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SolarmanSyncLog"
ADD CONSTRAINT "SolarmanSyncLog_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "SolarmanConnection"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
