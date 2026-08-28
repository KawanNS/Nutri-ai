-- CreateTable
CREATE TABLE "ProgressEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "weightKg" DECIMAL(6,2) NOT NULL,
    "recordedAt" DATE NOT NULL,
    "note" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProgressEntry_weightKg_check"
      CHECK ("weightKg" > 0 AND "weightKg" <= 9999.99)
);

-- CreateIndex
CREATE INDEX "ProgressEntry_userId_recordedAt_createdAt_id_idx"
ON "ProgressEntry"("userId", "recordedAt" DESC, "createdAt" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "ProgressEntry"
ADD CONSTRAINT "ProgressEntry_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
