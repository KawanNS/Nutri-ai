export type AIRouterTask = 'MEAL_PLAN_GENERATION' | 'NUTRITION_ASSISTANT' | 'MEAL_PHOTO_ANALYSIS' | 'MEAL_REPLACEMENT' | 'MEAL_PLAN_PREVIEW'
export type AIRouterProvider = 'GEMINI'

export interface AdminRoute { task: AIRouterTask; provider: AIRouterProvider; model: string; enabled: boolean; source: 'DEFAULT' | 'PERSISTED'; version: number }
export interface AdminProvider { provider: AIRouterProvider; displayName: string; operational: boolean; configured: boolean; status: 'ACTIVE' | 'NOT_CONFIGURED' | 'INACTIVE' | 'UNAVAILABLE'; capabilities: string[]; allowedModels: string[] }
export interface AdminModel { provider: AIRouterProvider; model: string; enabled: boolean }
export interface Pagination { page: number; limit: number; total: number; totalPages: number }
export interface TokenUsage { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; cachedInputTokens: number | null; reasoningTokens: number | null }
export interface EstimatedCost { currency: string; amountMicros: string; pricingVersion: number | null }
export interface UsageItem { task: AIRouterTask | null; provider: AIRouterProvider | null; model: string | null; startedAt: string; durationMs: number; success: boolean; errorCategory: string | null; usage: TokenUsage; estimatedCost: EstimatedCost | null }
export interface UsageResponse { summary: { calls: number; successfulCalls: number; failedCalls: number; latency: { totalMs: number; averageMs: number | null }; usage: TokenUsage }; items: UsageItem[]; pagination: Pagination }
export interface CostResponse { costs: { totalCalls: number; callsWithKnownCost: number; callsWithUnknownCost: number; totals: Array<{ currency: string; amountMicros: string }> } }
export interface AuditItem { action: 'CREATE' | 'UPDATE'; task: AIRouterTask; previousRoute: AdminRoute; currentRoute: AdminRoute; actorUserId: string; changedAt: string }
export interface AuditResponse { items: AuditItem[]; pagination: Pagination }

export type FunnelPeriod = 7 | 14 | 30
export interface FunnelTotals { previews: number; previewFailures: number; accounts: number; profiles: number; firstPlans: number; checkouts: number; subscriptions: number }
export interface FunnelAccount { name: string; createdAt: string; hasProfile: boolean; mealPlans: number; checkoutAttempts: number; isPremium: boolean }
export interface AdminFunnel { periodDays: FunnelPeriod; since: string; totals: FunnelTotals; days: Array<{ date: string; previews: number; accounts: number }>; sources: Array<{ source: string; previews: number; accounts: number }>; latestAccounts: FunnelAccount[] }
export interface AdminFunnelResponse { funnel: AdminFunnel }
