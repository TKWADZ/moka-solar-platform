CREATE TABLE "StaffPasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "requestedIp" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffPasswordResetToken_tokenHash_key"
ON "StaffPasswordResetToken"("tokenHash");

CREATE INDEX "StaffPasswordResetToken_userId_createdAt_idx"
ON "StaffPasswordResetToken"("userId", "createdAt");

CREATE INDEX "StaffPasswordResetToken_expiresAt_idx"
ON "StaffPasswordResetToken"("expiresAt");

ALTER TABLE "StaffPasswordResetToken"
ADD CONSTRAINT "StaffPasswordResetToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
