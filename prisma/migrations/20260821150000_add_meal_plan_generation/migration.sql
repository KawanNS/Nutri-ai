-- CreateTable
CREATE TABLE "MealPlan" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "usageEventId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "profileSnapshot" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "openaiResponseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsageEvent_id_userId_key"
ON "UsageEvent"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_usageEventId_key"
ON "MealPlan"("usageEventId");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_usageEventId_userId_key"
ON "MealPlan"("usageEventId", "userId");

-- CreateIndex
CREATE INDEX "MealPlan_userId_createdAt_idx"
ON "MealPlan"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "MealPlan"
ADD CONSTRAINT "MealPlan_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan"
ADD CONSTRAINT "MealPlan_usageEventId_userId_fkey"
FOREIGN KEY ("usageEventId", "userId") REFERENCES "UsageEvent"("id", "userId")
ON DELETE CASCADE ON UPDATE CASCADE;
