-- CreateTable
CREATE TABLE "ZaloProviderConfig" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "appId" TEXT,
    "appSecretEncrypted" TEXT,
    "oaId" TEXT,
    "accessTokenEncrypted" TEXT,
    "apiBaseUrl" TEXT,
    "templateInvoiceId" TEXT,
    "templateReminderId" TEXT,
    "templatePaidId" TEXT,
    "updatedByUserId" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastTestMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ZaloProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ZaloProviderConfig_provider_key" ON "ZaloProviderConfig"("provider");

-- CreateIndex
CREATE INDEX "ZaloProviderConfig_updatedByUserId_idx" ON "ZaloProviderConfig"("updatedByUserId");

-- CreateIndex
CREATE INDEX "ZaloProviderConfig_deletedAt_idx" ON "ZaloProviderConfig"("deletedAt");

-- AddForeignKey
ALTER TABLE "ZaloProviderConfig" ADD CONSTRAINT "ZaloProviderConfig_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
