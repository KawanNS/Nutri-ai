export type SubscriptionPlan = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'
export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'CANCELED' | 'EXPIRED' | 'PAST_DUE'

export interface SubscriptionAccess {
  isPremium: boolean
  plan: SubscriptionPlan | null
  status: SubscriptionStatus | null
  currentPeriodEnd: string | null
  canceledAt: string | null
}

/** Premium granted by the ADMIN role (decided by the server), not by a paid subscription. */
export interface BillingSubscription extends SubscriptionAccess { adminAccess: boolean }

export interface SubscriptionResponse { subscription: BillingSubscription }
export interface CheckoutResponse { checkoutUrl: string }
