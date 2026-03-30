ALTER TYPE "SystemStatus" ADD VALUE IF NOT EXISTS 'WARNING';
ALTER TYPE "SystemStatus" ADD VALUE IF NOT EXISTS 'FAULT';
ALTER TYPE "SystemStatus" ADD VALUE IF NOT EXISTS 'OFFLINE';

ALTER TABLE "Customer"
ADD COLUMN "defaultVatRate" DECIMAL(5,2);

ALTER TABLE "SolarSystem"
ADD COLUMN "defaultVatRate" DECIMAL(5,2);

ALTER TABLE "SolarmanConnection"
ADD COLUMN "defaultVatRate" DECIMAL(5,2);

ALTER TABLE "MonthlyEnergyRecord"
ADD COLUMN "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE "MonthlyPvBilling"
ADD COLUMN "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE "Invoice"
ADD COLUMN "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

UPDATE "Customer"
SET "defaultVatRate" = CASE
  WHEN "defaultTaxAmount" IS NOT NULL AND "defaultTaxAmount" >= 0 AND "defaultTaxAmount" <= 100
    THEN ROUND("defaultTaxAmount"::numeric, 2)
  ELSE NULL
END
WHERE "defaultVatRate" IS NULL;

UPDATE "SolarSystem"
SET "defaultVatRate" = CASE
  WHEN "defaultTaxAmount" IS NOT NULL AND "defaultTaxAmount" >= 0 AND "defaultTaxAmount" <= 100
    THEN ROUND("defaultTaxAmount"::numeric, 2)
  ELSE NULL
END
WHERE "defaultVatRate" IS NULL;

UPDATE "SolarmanConnection"
SET "defaultVatRate" = CASE
  WHEN "defaultTaxAmount" IS NOT NULL AND "defaultTaxAmount" >= 0 AND "defaultTaxAmount" <= 100
    THEN ROUND("defaultTaxAmount"::numeric, 2)
  ELSE NULL
END
WHERE "defaultVatRate" IS NULL;

UPDATE "MonthlyEnergyRecord"
SET "vatRate" = CASE
  WHEN "subtotalAmount" > 0 THEN ROUND(("taxAmount" / "subtotalAmount") * 100, 2)
  ELSE 0
END
WHERE "vatRate" = 0;

UPDATE "MonthlyPvBilling"
SET "vatRate" = CASE
  WHEN "subtotalAmount" > 0 THEN ROUND(("taxAmount" / "subtotalAmount") * 100, 2)
  ELSE 0
END
WHERE "vatRate" = 0;

UPDATE "Invoice"
SET "vatRate" = CASE
  WHEN "subtotal" > 0 THEN ROUND(("vatAmount" / "subtotal") * 100, 2)
  ELSE 0
END
WHERE "vatRate" = 0;
