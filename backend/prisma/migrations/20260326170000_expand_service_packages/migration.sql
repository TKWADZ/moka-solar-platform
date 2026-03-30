ALTER TABLE "ServicePackage"
ADD COLUMN "packageCode" TEXT,
ADD COLUMN "shortDescription" TEXT,
ADD COLUMN "defaultTermMonths" INTEGER,
ADD COLUMN "billingRule" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

WITH ranked_packages AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn
  FROM "ServicePackage"
)
UPDATE "ServicePackage" AS sp
SET "packageCode" = CONCAT('PKG-', LPAD(ranked_packages.rn::TEXT, 3, '0'))
FROM ranked_packages
WHERE ranked_packages."id" = sp."id"
  AND sp."packageCode" IS NULL;

ALTER TABLE "ServicePackage"
ALTER COLUMN "packageCode" SET NOT NULL;

CREATE UNIQUE INDEX "ServicePackage_packageCode_key" ON "ServicePackage"("packageCode");
CREATE INDEX "ServicePackage_packageCode_idx" ON "ServicePackage"("packageCode");
CREATE INDEX "ServicePackage_isActive_idx" ON "ServicePackage"("isActive");
