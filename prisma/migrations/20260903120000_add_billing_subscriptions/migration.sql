-- CreateEnum
CREATE TYPE "UsageEntitlement" AS ENUM ('FREE', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "SubscriptionProvider" AS ENUM ('CAKTO');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'CANCELED', 'EXPIRED', 'PAST_DUE');

-- CreateEnum
CREATE TYPE "CheckoutAttemptStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "SubscriptionProvider" NOT NULL DEFAULT 'CAKTO',
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "providerSubscriptionId" TEXT,
    "providerCustomerId" TEXT,
    "providerProductId" TEXT,
    "providerOfferId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "lastEventOccurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "CheckoutAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "checkoutUrl" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CheckoutAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" UUID NOT NULL,
    "provider" "SubscriptionProvider" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "payloadHash" TEXT,
    "processingError" TEXT,
    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "UsageEvent"
ADD COLUMN "entitlement" "UsageEntitlement" NOT NULL DEFAULT 'FREE',
ADD COLUMN "subscriptionId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");
CREATE INDEX "Subscription_userId_status_currentPeriodEnd_idx" ON "Subscription"("userId", "status", "currentPeriodEnd");
CREATE UNIQUE INDEX "CheckoutAttempt_token_key" ON "CheckoutAttempt"("token");
CREATE INDEX "CheckoutAttempt_userId_status_expiresAt_idx" ON "CheckoutAttempt"("userId", "status", "expiresAt");
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_providerEventId_key" ON "PaymentWebhookEvent"("provider", "providerEventId");
CREATE INDEX "UsageEvent_subscriptionId_status_createdAt_idx" ON "UsageEvent"("subscriptionId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckoutAttempt" ADD CONSTRAINT "CheckoutAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep entitlement and subscription reference consistent.
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_entitlement_subscription_consistency" CHECK (
    ("entitlement" = 'FREE' AND "subscriptionId" IS NULL)
    OR ("entitlement" = 'SUBSCRIPTION' AND "subscriptionId" IS NOT NULL)
);
