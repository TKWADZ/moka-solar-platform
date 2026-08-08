-- Add encrypted SOLARMAN OAuth token storage and refresh diagnostics.
-- Existing plaintext values are intentionally not copied in SQL because the
-- application encryption key is unavailable to Prisma migrations. The backend
-- migrates compatible legacy values under the per-connection advisory lock.
ALTER TABLE "SolarmanConnection"
ALTER COLUMN "passwordEncrypted" DROP NOT NULL,
ADD COLUMN "accessTokenEncrypted" TEXT,
ADD COLUMN "refreshTokenEncrypted" TEXT,
ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "lastSuccessfulRefreshAt" TIMESTAMP(3),
ADD COLUMN "lastRefreshErrorCode" TEXT,
ADD COLUMN "lastRefreshErrorMessage" TEXT,
ADD COLUMN "reauthorizationRequiredAt" TIMESTAMP(3),
ADD COLUMN "lastSuccessfulStationSyncAt" TIMESTAMP(3),
ADD COLUMN "lastDiscoveredStationCount" INTEGER;
