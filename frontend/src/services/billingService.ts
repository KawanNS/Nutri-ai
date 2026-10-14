import type { CheckoutResponse, SubscriptionPlan, SubscriptionResponse } from '../types/subscription'
import { apiRequest } from './api'

export function getSubscription(): Promise<SubscriptionResponse> {
  return apiRequest<SubscriptionResponse>('/api/billing/subscription')
}

export function startCheckout(plan: SubscriptionPlan): Promise<CheckoutResponse> {
  return apiRequest<CheckoutResponse>('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  })
}

export async function waitForPremiumConfirmation(
  attempts = 10,
  intervalMs = 1500,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if ((await getSubscription()).subscription.isPremium) return true
    } catch {
      // A transient API failure must not turn a browser return into entitlement.
    }
    if (attempt + 1 < attempts) {
      await new Promise((resolve) => window.setTimeout(resolve, intervalMs))
    }
  }
  return false
}
