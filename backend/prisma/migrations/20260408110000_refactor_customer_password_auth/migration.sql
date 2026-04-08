-- AlterEnum
ALTER TYPE "OtpRequestPurpose" ADD VALUE IF NOT EXISTS 'CUSTOMER_PASSWORD_RESET';
ALTER TYPE "OtpRequestPurpose" ADD VALUE IF NOT EXISTS 'CUSTOMER_PHONE_VERIFICATION';
ALTER TYPE "OtpRequestPurpose" ADD VALUE IF NOT EXISTS 'CUSTOMER_SENSITIVE_ACTION';

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "failedPasswordLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockedUntil" TIMESTAMP(3),
ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "lastLoginIp" TEXT,
ADD COLUMN "lastLoginUserAgent" TEXT;

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authMethod" TEXT NOT NULL,
    "identifierType" TEXT,
    "identifierValue" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceLabel" TEXT,
    "refreshTokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthLoginAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "authMethod" TEXT NOT NULL,
    "identifierType" TEXT NOT NULL,
    "identifierValue" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL,
    "outcome" TEXT NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthLoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthLoginAttempt_identifierType_identifierValue_createdAt_idx" ON "AuthLoginAttempt"("identifierType", "identifierValue", "createdAt");

-- CreateIndex
CREATE INDEX "AuthLoginAttempt_ipAddress_createdAt_idx" ON "AuthLoginAttempt"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "AuthLoginAttempt_userId_createdAt_idx" ON "AuthLoginAttempt"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthLoginAttempt" ADD CONSTRAINT "AuthLoginAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
