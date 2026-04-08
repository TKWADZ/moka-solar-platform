-- CreateEnum
CREATE TYPE "OtpRequestPurpose" AS ENUM ('CUSTOMER_LOGIN', 'CUSTOMER_REGISTER');

-- CreateEnum
CREATE TYPE "OtpRequestStatus" AS ENUM ('PENDING', 'SENT', 'DRY_RUN', 'FAILED', 'BLOCKED', 'VERIFIED', 'EXPIRED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ZaloProviderConfig" ADD COLUMN     "templateOtpId" TEXT;

-- CreateTable
CREATE TABLE "otp_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "purpose" "OtpRequestPurpose" NOT NULL,
    "provider" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "emailSnapshot" TEXT,
    "fullNameSnapshot" TEXT,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resendAvailableAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastAttemptAt" TIMESTAMP(3),
    "requestedIp" TEXT,
    "requestedUserAgent" TEXT,
    "sendStatus" "OtpRequestStatus" NOT NULL DEFAULT 'PENDING',
    "providerCode" TEXT,
    "providerMessage" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "otp_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "otp_requests_userId_purpose_createdAt_idx" ON "otp_requests"("userId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "otp_requests_phone_purpose_createdAt_idx" ON "otp_requests"("phone", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "otp_requests_requestedIp_createdAt_idx" ON "otp_requests"("requestedIp", "createdAt");

-- CreateIndex
CREATE INDEX "otp_requests_sendStatus_createdAt_idx" ON "otp_requests"("sendStatus", "createdAt");

-- CreateIndex
CREATE INDEX "otp_requests_deletedAt_idx" ON "otp_requests"("deletedAt");

-- AddForeignKey
ALTER TABLE "otp_requests" ADD CONSTRAINT "otp_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
