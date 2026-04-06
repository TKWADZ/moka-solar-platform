-- AlterTable
ALTER TABLE "ZaloProviderConfig"
ADD COLUMN "refreshTokenEncrypted" TEXT,
ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "lastRefreshAt" TIMESTAMP(3),
ADD COLUMN "lastRefreshStatus" TEXT,
ADD COLUMN "lastRefreshMessage" TEXT,
ADD COLUMN "lastTokenCheckedAt" TIMESTAMP(3),
ADD COLUMN "lastTokenStatus" TEXT,
ADD COLUMN "lastTokenMessage" TEXT;
