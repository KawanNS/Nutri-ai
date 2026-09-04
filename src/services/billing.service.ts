import type { SubscriptionPlan } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import {
  getEffectiveSubscriptionAccess,
  serializeSubscriptionAccess,
} from "./subscription.service.js";

export class BillingError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function getConfiguredCheckoutUrl(plan: SubscriptionPlan): string {
  const checkoutUrl = env.caktoCheckoutUrls[plan];
  const parsed = new URL(checkoutUrl);

  if (parsed.protocol !== "https:" || parsed.hostname !== "pay.cakto.com.br") {
    throw new BillingError(500, "INVALID_CHECKOUT_CONFIGURATION", "Checkout is not configured safely");
  }

  return parsed.toString();
}

export async function getSubscriptionForUser(userId: string) {
  return serializeSubscriptionAccess(await getEffectiveSubscriptionAccess(userId));
}

export function prepareCheckout(_userId: string, plan: SubscriptionPlan): never {
  getConfiguredCheckoutUrl(plan);
  throw new BillingError(
    503,
    "CHECKOUT_CORRELATION_NOT_VERIFIED",
    "Checkout is temporarily unavailable while secure account association is finalized",
  );
}
