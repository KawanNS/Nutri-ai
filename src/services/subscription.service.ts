import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

interface SubscriptionAccessRecord {
  id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
}

export interface EffectiveSubscriptionAccess {
  isPremium: boolean;
  subscriptionId: string | null;
  plan: SubscriptionPlan | null;
  status: SubscriptionStatus | null;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
}

export function isSubscriptionPremium(
  subscription: Pick<SubscriptionAccessRecord, "status" | "currentPeriodEnd">,
  now = new Date(),
): boolean {
  return (
    (subscription.status === "ACTIVE" || subscription.status === "CANCELED") &&
    subscription.currentPeriodEnd !== null &&
    subscription.currentPeriodEnd.getTime() > now.getTime()
  );
}

export function selectEffectiveSubscriptionAccess(
  subscriptions: SubscriptionAccessRecord[],
  now = new Date(),
): EffectiveSubscriptionAccess {
  const premium = subscriptions.find((item) => isSubscriptionPremium(item, now));
  const selected = premium ?? subscriptions[0];

  return {
    isPremium: premium !== undefined,
    subscriptionId: premium?.id ?? null,
    plan: selected?.plan ?? null,
    status: selected?.status ?? null,
    currentPeriodEnd: selected?.currentPeriodEnd ?? null,
    canceledAt: selected?.canceledAt ?? null,
  };
}

export async function getEffectiveSubscriptionAccess(
  userId: string,
  now = new Date(),
): Promise<EffectiveSubscriptionAccess> {
  const subscriptions = await prisma.subscription.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      plan: true,
      status: true,
      currentPeriodEnd: true,
      canceledAt: true,
    },
  });

  return selectEffectiveSubscriptionAccess(subscriptions, now);
}

export function serializeSubscriptionAccess(access: EffectiveSubscriptionAccess) {
  return {
    isPremium: access.isPremium,
    plan: access.plan,
    status: access.status,
    currentPeriodEnd: access.currentPeriodEnd,
    canceledAt: access.canceledAt,
  };
}
