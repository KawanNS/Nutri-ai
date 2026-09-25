-- CreateEnum
CREATE TYPE "FoodEstimateConfidence" AS ENUM ('UNKNOWN', 'LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "FoodLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimatedCaloriesKcal" DECIMAL(8,2),
    "estimatedProteinGrams" DECIMAL(8,2),
    "estimatedCarbohydrateGrams" DECIMAL(8,2),
    "estimatedFatGrams" DECIMAL(8,2),
    "notes" VARCHAR(1000),
    "uncertaintyNotes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FoodLog_estimates_nonnegative_check" CHECK (
      ("estimatedCaloriesKcal" IS NULL OR "estimatedCaloriesKcal" >= 0) AND
      ("estimatedProteinGrams" IS NULL OR "estimatedProteinGrams" >= 0) AND
      ("estimatedCarbohydrateGrams" IS NULL OR "estimatedCarbohydrateGrams" >= 0) AND
      ("estimatedFatGrams" IS NULL OR "estimatedFatGrams" >= 0)
    )
);

-- CreateTable
CREATE TABLE "FoodLogItem" (
    "id" UUID NOT NULL,
    "foodLogId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "portionDescription" VARCHAR(240) NOT NULL,
    "estimatedCaloriesKcal" DECIMAL(8,2),
    "estimatedProteinGrams" DECIMAL(8,2),
    "estimatedCarbohydrateGrams" DECIMAL(8,2),
    "estimatedFatGrams" DECIMAL(8,2),
    "confidence" "FoodEstimateConfidence" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodLogItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FoodLogItem_position_nonnegative_check" CHECK ("position" >= 0),
    CONSTRAINT "FoodLogItem_estimates_nonnegative_check" CHECK (
      ("estimatedCaloriesKcal" IS NULL OR "estimatedCaloriesKcal" >= 0) AND
      ("estimatedProteinGrams" IS NULL OR "estimatedProteinGrams" >= 0) AND
      ("estimatedCarbohydrateGrams" IS NULL OR "estimatedCarbohydrateGrams" >= 0) AND
      ("estimatedFatGrams" IS NULL OR "estimatedFatGrams" >= 0)
    )
);

-- CreateIndex
CREATE INDEX "FoodLog_userId_consumedAt_createdAt_id_idx"
ON "FoodLog"("userId", "consumedAt" DESC, "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "FoodLogItem_foodLogId_position_key"
ON "FoodLogItem"("foodLogId", "position");

-- CreateIndex
CREATE INDEX "FoodLogItem_foodLogId_idx" ON "FoodLogItem"("foodLogId");

-- AddForeignKey
ALTER TABLE "FoodLog"
ADD CONSTRAINT "FoodLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodLogItem"
ADD CONSTRAINT "FoodLogItem_foodLogId_fkey"
FOREIGN KEY ("foodLogId") REFERENCES "FoodLog"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
