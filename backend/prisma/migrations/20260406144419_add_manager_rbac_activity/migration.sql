-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "afterState" JSONB,
ADD COLUMN     "beforeState" JSONB,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "moduleKey" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "permissions" JSONB;

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedByUserId" TEXT,
ADD COLUMN     "lastHandledByUserId" TEXT;

-- CreateTable
CREATE TABLE "InternalNote" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityAssignment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "assignedByUserId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "lastHandledByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InternalNote_entityType_entityId_idx" ON "InternalNote"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "InternalNote_createdByUserId_idx" ON "InternalNote"("createdByUserId");

-- CreateIndex
CREATE INDEX "InternalNote_createdAt_idx" ON "InternalNote"("createdAt");

-- CreateIndex
CREATE INDEX "InternalNote_deletedAt_idx" ON "InternalNote"("deletedAt");

-- CreateIndex
CREATE INDEX "EntityAssignment_entityType_entityId_idx" ON "EntityAssignment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EntityAssignment_assignedToUserId_idx" ON "EntityAssignment"("assignedToUserId");

-- CreateIndex
CREATE INDEX "EntityAssignment_assignedByUserId_idx" ON "EntityAssignment"("assignedByUserId");

-- CreateIndex
CREATE INDEX "EntityAssignment_lastHandledByUserId_idx" ON "EntityAssignment"("lastHandledByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityAssignment_entityType_entityId_key" ON "EntityAssignment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_moduleKey_idx" ON "AuditLog"("moduleKey");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedByUserId_idx" ON "SupportTicket"("assignedByUserId");

-- CreateIndex
CREATE INDEX "SupportTicket_lastHandledByUserId_idx" ON "SupportTicket"("lastHandledByUserId");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_lastHandledByUserId_fkey" FOREIGN KEY ("lastHandledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityAssignment" ADD CONSTRAINT "EntityAssignment_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityAssignment" ADD CONSTRAINT "EntityAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityAssignment" ADD CONSTRAINT "EntityAssignment_lastHandledByUserId_fkey" FOREIGN KEY ("lastHandledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
