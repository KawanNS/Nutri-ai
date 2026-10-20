import type { SubscriptionAccess } from './subscription'

export interface Usage extends SubscriptionAccess {
  freeUsesLimit: number
  freeUsesConsumed: number
  freeUsesReserved: number
  /** Premium granted by the ADMIN role (from /api/billing/subscription). */
  adminAccess?: boolean
  freeUsesAvailable: number
}

export interface UsageResponse { usage: Usage }
