ALTER TABLE "MonthlyEnergyRecord"
ADD COLUMN IF NOT EXISTS "loadConsumedKwh" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "savingsAmount" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "systemStatusSnapshot" "SystemStatus",
ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "MonthlyEnergyRecord_updatedByUserId_idx"
ON "MonthlyEnergyRecord"("updatedByUserId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'MonthlyEnergyRecord_updatedByUserId_fkey'
    ) THEN
        ALTER TABLE "MonthlyEnergyRecord"
        ADD CONSTRAINT "MonthlyEnergyRecord_updatedByUserId_fkey"
        FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
