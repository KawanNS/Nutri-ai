import type { UsageResponse } from '../types/usage'
import { apiRequest } from './api'

export function getUsage(): Promise<UsageResponse> {
  return apiRequest<UsageResponse>('/api/usage')
}
