import type { CreateProgressInput, CreateProgressResponse, ProgressListResponse } from '../types/progress'
import { apiRequest } from './api'
const PAGE_SIZE = 20
export function listProgress(cursor?: string): Promise<ProgressListResponse> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
  if (cursor) params.set('cursor', cursor)
  return apiRequest<ProgressListResponse>(`/api/progress?${params}`)
}
export function createProgress(input: CreateProgressInput): Promise<CreateProgressResponse> {
  return apiRequest<CreateProgressResponse>('/api/progress', { method: 'POST', body: JSON.stringify(input) })
}
