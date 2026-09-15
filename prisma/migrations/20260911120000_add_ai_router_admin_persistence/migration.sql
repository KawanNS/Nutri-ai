-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AiRouteAuditAction" AS ENUM ('CREATE', 'UPDATE');

-- CreateEnum
CREATE TYPE "AiRouteOrigin" AS ENUM ('DEFAULT', 'PERSISTED');

-- AlterTable: the default keeps every existing and future user non-administrative.
ALTER TABLE "User"
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "AiRouteConfig" (
    "id" UUID NOT NULL,
    "task" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiRouteConfig_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiRouteConfig_version_positive" CHECK ("version" >= 1)
);

-- CreateTable
CREATE TABLE "AiRouteAuditLog" (
    "id" UUID NOT NULL,
    "routeConfigId" UUID NOT NULL,
    "task" VARCHAR(64) NOT NULL,
    "action" "AiRouteAuditAction" NOT NULL,
    "previousOrigin" "AiRouteOrigin" NOT NULL,
    "previousProvider" VARCHAR(32) NOT NULL,
    "previousModel" VARCHAR(120) NOT NULL,
    "previousEnabled" BOOLEAN NOT NULL,
    "previousVersion" INTEGER,
    "newProvider" VARCHAR(32) NOT NULL,
    "newModel" VARCHAR(120) NOT NULL,
    "newEnabled" BOOLEAN NOT NULL,
    "newVersion" INTEGER NOT NULL,
    "changedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiRouteAuditLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiRouteAuditLog_version_consistency" CHECK (
        ("previousOrigin" = 'DEFAULT' AND "previousVersion" IS NULL AND "newVersion" = 1)
        OR
        ("previousOrigin" = 'PERSISTED' AND "previousVersion" >= 1 AND "newVersion" = "previousVersion" + 1)
    )
);

-- CreateTable
CREATE TABLE "AiModelPricing" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "version" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "currency" CHAR(3) NOT NULL,
    "inputMicrosPerMillionTokens" BIGINT NOT NULL,
    "outputMicrosPerMillionTokens" BIGINT NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiModelPricing_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiModelPricing_values_valid" CHECK (
        "version" >= 1
        AND "inputMicrosPerMillionTokens" >= 0
        AND "outputMicrosPerMillionTokens" >= 0
        AND ("validUntil" IS NULL OR "validUntil" > "validFrom")
    )
);

-- CreateTable
CREATE TABLE "AiUsageEvent" (
    "id" UUID NOT NULL,
    "task" VARCHAR(64),
    "provider" VARCHAR(32),
    "model" VARCHAR(120),
    "startedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorCategory" VARCHAR(64),
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "estimatedCostMicros" BIGINT,
    "estimatedCurrency" CHAR(3),
    "pricingVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiUsageEvent_values_nonnegative" CHECK (
        "durationMs" >= 0
        AND ("inputTokens" IS NULL OR "inputTokens" >= 0)
        AND ("outputTokens" IS NULL OR "outputTokens" >= 0)
        AND ("totalTokens" IS NULL OR "totalTokens" >= 0)
        AND ("cachedInputTokens" IS NULL OR "cachedInputTokens" >= 0)
        AND ("reasoningTokens" IS NULL OR "reasoningTokens" >= 0)
        AND ("estimatedCostMicros" IS NULL OR "estimatedCostMicros" >= 0)
        AND ("pricingVersion" IS NULL OR "pricingVersion" >= 1)
    ),
    CONSTRAINT "AiUsageEvent_estimate_consistency" CHECK (
        ("estimatedCostMicros" IS NULL AND "estimatedCurrency" IS NULL AND "pricingVersion" IS NULL)
        OR
        ("estimatedCostMicros" IS NOT NULL AND "estimatedCurrency" IS NOT NULL AND "pricingVersion" IS NOT NULL AND "provider" IS NOT NULL AND "model" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "AiRouteConfig_task_key" ON "AiRouteConfig"("task");
CREATE INDEX "AiRouteConfig_updatedByUserId_updatedAt_idx" ON "AiRouteConfig"("updatedByUserId", "updatedAt" DESC);
CREATE UNIQUE INDEX "AiRouteAuditLog_routeConfigId_newVersion_key" ON "AiRouteAuditLog"("routeConfigId", "newVersion");
CREATE INDEX "AiRouteAuditLog_task_createdAt_id_idx" ON "AiRouteAuditLog"("task", "createdAt" DESC, "id" DESC);
CREATE INDEX "AiRouteAuditLog_changedByUserId_createdAt_idx" ON "AiRouteAuditLog"("changedByUserId", "createdAt" DESC);
CREATE UNIQUE INDEX "AiModelPricing_provider_model_version_key" ON "AiModelPricing"("provider", "model", "version");
CREATE INDEX "AiModelPricing_provider_model_validFrom_idx" ON "AiModelPricing"("provider", "model", "validFrom" DESC);
CREATE INDEX "AiUsageEvent_createdAt_id_idx" ON "AiUsageEvent"("createdAt" DESC, "id" DESC);
CREATE INDEX "AiUsageEvent_task_createdAt_idx" ON "AiUsageEvent"("task", "createdAt" DESC);
CREATE INDEX "AiUsageEvent_provider_createdAt_idx" ON "AiUsageEvent"("provider", "createdAt" DESC);
CREATE INDEX "AiUsageEvent_model_createdAt_idx" ON "AiUsageEvent"("model", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "AiRouteConfig" ADD CONSTRAINT "AiRouteConfig_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiRouteAuditLog" ADD CONSTRAINT "AiRouteAuditLog_routeConfigId_fkey" FOREIGN KEY ("routeConfigId") REFERENCES "AiRouteConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiRouteAuditLog" ADD CONSTRAINT "AiRouteAuditLog_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiModelPricing" ADD CONSTRAINT "AiModelPricing_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_provider_model_pricingVersion_fkey" FOREIGN KEY ("provider", "model", "pricingVersion") REFERENCES "AiModelPricing"("provider", "model", "version") ON DELETE RESTRICT ON UPDATE CASCADE;
