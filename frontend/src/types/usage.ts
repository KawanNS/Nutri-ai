export interface Usage {
  freeUsesLimit: number
  freeUsesConsumed: number
  freeUsesReserved: number
  freeUsesAvailable: number
}

export interface UsageResponse { usage: Usage }
