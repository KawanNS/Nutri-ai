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

export interface PremiumAccess extends EffectiveSubscriptionAccess {
  /** Premium granted by the ADMIN role, not by a paid subscription. */
  adminAccess: boolean;
}

interface PremiumAccessClient {
  user: {
    findUnique(args: {
      where: { id: string };
      select: { role: true };
    }): Promise<{ role: "USER" | "ADMIN" } | null>;
  };
  subscription: {
    findMany(args: {
      where: { userId: string };
      orderBy: Array<{ updatedAt: "desc" } | { id: "desc" }>;
      select: {
        id: true;
        plan: true;
        status: true;
        currentPeriodEnd: true;
        canceledAt: true;
      };
    }): Promise<SubscriptionAccessRecord[]>;
  };
}

export function selectPremiumAccess(
  role: "USER" | "ADMIN" | null,
  subscriptions: SubscriptionAccessRecord[],
  now = new Date(),
): PremiumAccess {
  const access = selectEffectiveSubscriptionAccess(subscriptions, now);
  // A real paid subscription always wins, so admin access never masks billing state.
  const adminAccess = !access.isPremium && role === "ADMIN";
  return { ...access, isPremium: access.isPremium || adminAccess, adminAccess };
}

/**
 * Premium access for feature gates (assistant, meal photo) and the billing status
 * endpoint. The role is always read from the database, never from the client.
 * getUsage keeps reporting subscription-only access; reserveUsage reads the role
 * itself so ADMIN meal plan generations skip the free-use counters.
 */
export async function getPremiumAccess(
  userId: string,
  now = new Date(),
  client: PremiumAccessClient = prisma,
): Promise<PremiumAccess> {
  const [user, subscriptions] = await Promise.all([
    client.user.findUnique({ where: { id: userId }, select: { role: true } }),
    client.subscription.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        plan: true,
        status: true,
        currentPeriodEnd: true,
        canceledAt: true,
      },
    }),
  ]);

  return selectPremiumAccess(user?.role ?? null, subscriptions, now);
}

export function serializePremiumAccess(access: PremiumAccess) {
  return {
    ...serializeSubscriptionAccess(access),
    adminAccess: access.adminAccess,
  };
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
