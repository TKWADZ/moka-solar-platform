-- CreateTable
CREATE TABLE "MonthlyPvBilling" (
    "id" TEXT NOT NULL,
    "solarSystemId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "contractId" TEXT,
    "invoiceId" TEXT,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "pvGenerationKwh" DECIMAL(12,2) NOT NULL,
    "billableKwh" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "subtotalAmount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "syncTime" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MonthlyPvBilling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyPvBilling_invoiceId_key" ON "MonthlyPvBilling"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyPvBilling_solarSystemId_month_year_key" ON "MonthlyPvBilling"("solarSystemId", "month", "year");

-- CreateIndex
CREATE INDEX "MonthlyPvBilling_customerId_year_month_idx" ON "MonthlyPvBilling"("customerId", "year", "month");

-- CreateIndex
CREATE INDEX "MonthlyPvBilling_contractId_idx" ON "MonthlyPvBilling"("contractId");

-- CreateIndex
CREATE INDEX "MonthlyPvBilling_deletedAt_idx" ON "MonthlyPvBilling"("deletedAt");

-- AddForeignKey
ALTER TABLE "MonthlyPvBilling" ADD CONSTRAINT "MonthlyPvBilling_solarSystemId_fkey" FOREIGN KEY ("solarSystemId") REFERENCES "SolarSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPvBilling" ADD CONSTRAINT "MonthlyPvBilling_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPvBilling" ADD CONSTRAINT "MonthlyPvBilling_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPvBilling" ADD CONSTRAINT "MonthlyPvBilling_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
