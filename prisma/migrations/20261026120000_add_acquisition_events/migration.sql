-- CreateEnum
CREATE TYPE "AcquisitionKind" AS ENUM ('PREVIEW', 'SIGNUP');

-- CreateTable
CREATE TABLE "AcquisitionEvent" (
    "id" UUID NOT NULL,
    "kind" "AcquisitionKind" NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcquisitionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcquisitionEvent_createdAt_idx" ON "AcquisitionEvent"("createdAt");
