-- CreateTable
CREATE TABLE "FeaturePlugin" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "installed" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "editable" BOOLEAN NOT NULL DEFAULT true,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "routePath" TEXT,
    "areas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeaturePlugin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeaturePlugin_key_key" ON "FeaturePlugin"("key");

-- CreateIndex
CREATE INDEX "FeaturePlugin_category_idx" ON "FeaturePlugin"("category");

-- CreateIndex
CREATE INDEX "FeaturePlugin_enabled_installed_idx" ON "FeaturePlugin"("enabled", "installed");

-- CreateIndex
CREATE INDEX "FeaturePlugin_deletedAt_idx" ON "FeaturePlugin"("deletedAt");
