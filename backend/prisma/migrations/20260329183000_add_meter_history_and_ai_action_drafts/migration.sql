-- AlterTable
ALTER TABLE "MonthlyEnergyRecord"
ADD COLUMN "meterReadingStart" DECIMAL(14,2),
ADD COLUMN "meterReadingEnd" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "AiActionDraft" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT,
    "content" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB,
    "createdByUserId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AiActionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiActionDraft_actionType_status_idx" ON "AiActionDraft"("actionType", "status");

-- CreateIndex
CREATE INDEX "AiActionDraft_createdByUserId_idx" ON "AiActionDraft"("createdByUserId");

-- CreateIndex
CREATE INDEX "AiActionDraft_targetType_targetId_idx" ON "AiActionDraft"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AiActionDraft_deletedAt_idx" ON "AiActionDraft"("deletedAt");

-- AddForeignKey
ALTER TABLE "AiActionDraft" ADD CONSTRAINT "AiActionDraft_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
