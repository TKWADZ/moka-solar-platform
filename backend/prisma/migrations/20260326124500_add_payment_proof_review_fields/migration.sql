ALTER TABLE "Payment"
ADD COLUMN IF NOT EXISTS "proofStoragePath" TEXT,
ADD COLUMN IF NOT EXISTS "proofOriginalName" TEXT,
ADD COLUMN IF NOT EXISTS "proofMimeType" TEXT,
ADD COLUMN IF NOT EXISTS "referenceNote" TEXT,
ADD COLUMN IF NOT EXISTS "reviewNote" TEXT,
ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "reviewedByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Payment_reviewedByUserId_idx"
ON "Payment"("reviewedByUserId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Payment_reviewedByUserId_fkey'
    ) THEN
        ALTER TABLE "Payment"
        ADD CONSTRAINT "Payment_reviewedByUserId_fkey"
        FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
