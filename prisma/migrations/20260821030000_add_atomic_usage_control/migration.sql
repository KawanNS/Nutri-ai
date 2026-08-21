-- CreateEnum
CREATE TYPE "UsageAction" AS ENUM ('PLAN_GENERATION', 'RELEVANT_REGENERATION');

-- CreateEnum
CREATE TYPE "UsageStatus" AS ENUM ('PENDING', 'CONSUMED', 'RELEASED', 'FAILED');

-- AlterTable
ALTER TABLE "UsageControl"
ADD COLUMN "freeUsesReserved" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "usageControlId" UUID NOT NULL,
    "action" "UsageAction" NOT NULL,
    "status" "UsageStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsageEvent_userId_idempotencyKey_key"
ON "UsageEvent"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "UsageControl_id_userId_key"
ON "UsageControl"("id", "userId");

-- CreateIndex
CREATE INDEX "UsageEvent_usageControlId_status_createdAt_idx"
ON "UsageEvent"("usageControlId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "UsageEvent"
ADD CONSTRAINT "UsageEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent"
ADD CONSTRAINT "UsageEvent_usageControlId_fkey"
FOREIGN KEY ("usageControlId", "userId") REFERENCES "UsageControl"("id", "userId")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "UsageControl"
ADD CONSTRAINT "UsageControl_freeUsesLimit_nonnegative"
CHECK ("freeUsesLimit" >= 0);

-- AddCheckConstraint
ALTER TABLE "UsageControl"
ADD CONSTRAINT "UsageControl_freeUsesConsumed_nonnegative"
CHECK ("freeUsesConsumed" >= 0);

-- AddCheckConstraint
ALTER TABLE "UsageControl"
ADD CONSTRAINT "UsageControl_freeUsesReserved_nonnegative"
CHECK ("freeUsesReserved" >= 0);

-- AddCheckConstraint
ALTER TABLE "UsageControl"
ADD CONSTRAINT "UsageControl_freeUses_within_limit"
CHECK ("freeUsesConsumed" + "freeUsesReserved" <= "freeUsesLimit");

-- AddCheckConstraint
ALTER TABLE "UsageEvent"
ADD CONSTRAINT "UsageEvent_finalization_consistency"
CHECK (
    ("status" = 'PENDING' AND "finalizedAt" IS NULL)
    OR
    ("status" <> 'PENDING' AND "finalizedAt" IS NOT NULL)
);
