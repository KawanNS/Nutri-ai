import type { SubscriptionPlan } from "../generated/prisma/client.js";
import { env } from "../config/env.js";

export interface CaktoProviderPlanIdentifiers {
  productId: string;
  offerId: string;
}

export type CaktoPlanAllowlist = Record<SubscriptionPlan, CaktoProviderPlanIdentifiers>;

export type CaktoPlanConfiguration = Record<
  SubscriptionPlan,
  { productId: string | null; offerId: string | null }
>;

const subscriptionPlans = ["MONTHLY", "QUARTERLY", "ANNUAL"] as const;

export const caktoPlanPriceCents: Record<SubscriptionPlan, number> = {
  MONTHLY: 1_990,
  QUARTERLY: 4_990,
  ANNUAL: 15_990,
};

export function caktoOfferPriceToCents(price: number): number | null {
  if (!Number.isFinite(price) || price < 0) return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(price.toString());
  if (!match) return null;

  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function matchesCaktoPlanPrice(plan: SubscriptionPlan, offerPrice: number): boolean {
  return caktoOfferPriceToCents(offerPrice) === caktoPlanPriceCents[plan];
}

export function buildCaktoPlanAllowlist(
  configuration: CaktoPlanConfiguration,
): CaktoPlanAllowlist | null {
  const entries = subscriptionPlans.map((plan) => ({
    plan,
    productId: configuration[plan].productId?.trim() || "",
    offerId: configuration[plan].offerId?.trim() || "",
  }));

  if (entries.some(({ productId, offerId }) => productId.length === 0 || offerId.length === 0)) {
    return null;
  }

  const providerPairs = entries.map(({ productId, offerId }) => `${productId}\u0000${offerId}`);
  if (new Set(providerPairs).size !== providerPairs.length) return null;

  return Object.fromEntries(
    entries.map(({ plan, productId, offerId }) => [plan, { productId, offerId }]),
  ) as CaktoPlanAllowlist;
}

export function getConfiguredCaktoPlanAllowlist(): CaktoPlanAllowlist | null {
  return buildCaktoPlanAllowlist({
    MONTHLY: {
      productId: env.caktoProductIds.MONTHLY,
      offerId: env.caktoOfferIds.MONTHLY,
    },
    QUARTERLY: {
      productId: env.caktoProductIds.QUARTERLY,
      offerId: env.caktoOfferIds.QUARTERLY,
    },
    ANNUAL: {
      productId: env.caktoProductIds.ANNUAL,
      offerId: env.caktoOfferIds.ANNUAL,
    },
  });
}

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
