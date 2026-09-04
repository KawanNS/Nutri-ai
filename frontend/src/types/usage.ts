import type { SubscriptionAccess } from './subscription'

export interface Usage extends SubscriptionAccess {
  freeUsesLimit: number
  freeUsesConsumed: number
  freeUsesReserved: number
  freeUsesAvailable: number
}

export interface UsageResponse { usage: Usage }
