-- CreateTable
CREATE TABLE "ZaloMessageLog" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "templateId" TEXT,
    "sendStatus" TEXT NOT NULL,
    "providerCode" TEXT,
    "providerMessage" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ZaloMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ZaloMessageLog_invoiceId_createdAt_idx" ON "ZaloMessageLog"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "ZaloMessageLog_customerId_createdAt_idx" ON "ZaloMessageLog"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "ZaloMessageLog_sendStatus_createdAt_idx" ON "ZaloMessageLog"("sendStatus", "createdAt");

-- CreateIndex
CREATE INDEX "ZaloMessageLog_templateType_idx" ON "ZaloMessageLog"("templateType");

-- CreateIndex
CREATE INDEX "ZaloMessageLog_deletedAt_idx" ON "ZaloMessageLog"("deletedAt");

-- AddForeignKey
ALTER TABLE "ZaloMessageLog" ADD CONSTRAINT "ZaloMessageLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZaloMessageLog" ADD CONSTRAINT "ZaloMessageLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
