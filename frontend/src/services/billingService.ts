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
