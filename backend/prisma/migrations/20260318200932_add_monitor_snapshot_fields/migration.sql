-- AlterTable
ALTER TABLE "SolarSystem" ADD COLUMN     "latestMonitorAt" TIMESTAMP(3),
ADD COLUMN     "latestMonitorSnapshot" JSONB,
ADD COLUMN     "monitoringPlantId" TEXT,
ADD COLUMN     "monitoringProvider" TEXT;

-- CreateIndex
CREATE INDEX "SolarSystem_monitoringPlantId_idx" ON "SolarSystem"("monitoringPlantId");
