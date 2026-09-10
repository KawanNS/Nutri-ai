import type { SubscriptionPlan } from "../generated/prisma/client.js";

export interface CaktoProviderPlanIdentifiers {
  productId: string;
  offerId: string;
}

export type CaktoPlanAllowlist = Record<SubscriptionPlan, CaktoProviderPlanIdentifiers>;

const subscriptionPlans = ["MONTHLY", "QUARTERLY", "ANNUAL"] as const;

export function resolveCaktoPlan(
  allowlist: CaktoPlanAllowlist,
  identifiers: CaktoProviderPlanIdentifiers,
): SubscriptionPlan | null {
  if (identifiers.productId.length === 0 || identifiers.offerId.length === 0) return null;

  const matches = subscriptionPlans.filter((plan) => {
    const allowed = allowlist[plan];
    return (
      allowed.productId.length > 0 &&
      allowed.offerId.length > 0 &&
      allowed.productId === identifiers.productId &&
      allowed.offerId === identifiers.offerId
    );
  });

  return matches.length === 1 ? matches[0] : null;
}
