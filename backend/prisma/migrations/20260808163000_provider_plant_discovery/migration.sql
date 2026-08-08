ALTER TABLE "SolarSystem"
ADD COLUMN "luxPowerDiscoveryConnectionId" TEXT,
ADD COLUMN "providerLastSeenAt" TIMESTAMP(3),
ADD COLUMN "providerDisconnectedAt" TIMESTAMP(3);

CREATE INDEX "SolarSystem_luxPowerDiscoveryConnectionId_idx"
ON "SolarSystem"("luxPowerDiscoveryConnectionId");

ALTER TABLE "SolarSystem"
ADD CONSTRAINT "SolarSystem_luxPowerDiscoveryConnectionId_fkey"
FOREIGN KEY ("luxPowerDiscoveryConnectionId") REFERENCES "LuxPowerConnection"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
