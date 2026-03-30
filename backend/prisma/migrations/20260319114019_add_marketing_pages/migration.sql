-- CreateTable
CREATE TABLE "MarketingPage" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MarketingPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingPage_key_key" ON "MarketingPage"("key");

-- CreateIndex
CREATE INDEX "MarketingPage_published_idx" ON "MarketingPage"("published");

-- CreateIndex
CREATE INDEX "MarketingPage_sortOrder_idx" ON "MarketingPage"("sortOrder");

-- CreateIndex
CREATE INDEX "MarketingPage_deletedAt_idx" ON "MarketingPage"("deletedAt");
