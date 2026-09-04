export type SubscriptionPlan = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'
export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'CANCELED' | 'EXPIRED' | 'PAST_DUE'

export interface SubscriptionAccess {
  isPremium: boolean
  plan: SubscriptionPlan | null
  status: SubscriptionStatus | null
  currentPeriodEnd: string | null
  canceledAt: string | null
}

export interface SubscriptionResponse { subscription: SubscriptionAccess }
export interface CheckoutResponse { checkoutUrl: string }
