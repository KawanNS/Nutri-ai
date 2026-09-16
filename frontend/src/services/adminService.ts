import type { AdminModel, AdminProvider, AdminRoute, AIRouterProvider, AIRouterTask, AuditResponse, CostResponse, UsageResponse } from '../types/admin'
import { apiRequest } from './api'

export interface AdminFilters { task?: string; provider?: string; model?: string; status?: string; from?: string; to?: string }
function query(filters: AdminFilters): string {
  const search = new URLSearchParams({ page: '1', limit: '20' })
  for (const [key, value] of Object.entries(filters)) if (value) search.set(key, value)
  return search.toString()
}
export const listAdminRoutes = () => apiRequest<{ routes: AdminRoute[] }>('/api/admin/ai-router/routes')
export const listAdminProviders = () => apiRequest<{ providers: AdminProvider[] }>('/api/admin/ai-router/providers')
export const listAdminModels = () => apiRequest<{ models: AdminModel[] }>('/api/admin/ai-router/models')
export const listAdminUsage = (filters: AdminFilters) => apiRequest<UsageResponse>(`/api/admin/ai-router/usage?${query(filters)}`)
export const listAdminCosts = (filters: AdminFilters) => apiRequest<CostResponse>(`/api/admin/ai-router/costs?${query(filters)}`)
export const listAdminAudit = (filters: Pick<AdminFilters, 'task' | 'from' | 'to'>) => apiRequest<AuditResponse>(`/api/admin/ai-router/audit?${query(filters)}`)
export const updateAdminRoute = (task: AIRouterTask, input: { provider: AIRouterProvider; model: string; enabled: boolean; expectedVersion: number }) => apiRequest<{ route: AdminRoute }>(`/api/admin/ai-router/routes/${encodeURIComponent(task)}`, { method: 'PUT', body: JSON.stringify(input) })
