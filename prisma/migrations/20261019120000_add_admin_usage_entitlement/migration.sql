-- ADMIN accounts without a paid subscription generate meal plans without spending free uses.
ALTER TYPE "UsageEntitlement" ADD VALUE IF NOT EXISTS 'ADMIN';

-- The new enum value cannot be used as an enum literal in the same transaction,
-- so the consistency check compares the text form instead.
ALTER TABLE "UsageEvent" DROP CONSTRAINT "UsageEvent_entitlement_subscription_consistency";
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_entitlement_subscription_consistency" CHECK (
    ("entitlement"::text IN ('FREE', 'ADMIN') AND "subscriptionId" IS NULL)
    OR ("entitlement"::text = 'SUBSCRIPTION' AND "subscriptionId" IS NOT NULL)
);
