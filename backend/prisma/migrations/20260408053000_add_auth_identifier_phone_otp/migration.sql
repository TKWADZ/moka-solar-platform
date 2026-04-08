-- AlterTable
ALTER TABLE "User"
ALTER COLUMN "email" DROP NOT NULL;

-- CreateEnum
CREATE TYPE "LoginOtpPurpose" AS ENUM ('CUSTOMER_LOGIN');

-- CreateTable
CREATE TABLE "LoginOtpChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "LoginOtpPurpose" NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastAttemptAt" TIMESTAMP(3),
    "deliveryMode" TEXT,
    "requestedIp" TEXT,
    "requestedUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "LoginOtpChallenge_userId_purpose_idx" ON "LoginOtpChallenge"("userId", "purpose");

-- CreateIndex
CREATE INDEX "LoginOtpChallenge_phone_purpose_expiresAt_idx" ON "LoginOtpChallenge"("phone", "purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "LoginOtpChallenge_createdAt_idx" ON "LoginOtpChallenge"("createdAt");

-- AddForeignKey
ALTER TABLE "LoginOtpChallenge"
ADD CONSTRAINT "LoginOtpChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
