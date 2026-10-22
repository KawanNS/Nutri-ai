import { ApiError, apiRequest } from './api'
import type { PlanPreviewResponse } from '../types/planPreview'
import type { ProfileOnboardingDraft } from '../types/profile'

/** Public: one day of the plan from the onboarding answers, before an account exists. */
export function getPlanPreview(draft: ProfileOnboardingDraft): Promise<PlanPreviewResponse> {
  return apiRequest<PlanPreviewResponse>('/api/plan-preview', { method: 'POST', body: JSON.stringify(draft) })
}

/** A network failure or a 5xx usually means the API was still waking up; a 4xx is a real answer. */
function isTransient(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status >= 500
}

/**
 * Asks once more after a short pause when the first request fails in a way that tends to pass,
 * so a visitor who arrives while the API is waking up gets the preview instead of an error.
 */
export async function getPlanPreviewWithRetry(draft: ProfileOnboardingDraft, retryDelayMs = 3000): Promise<PlanPreviewResponse> {
  try {
    return await getPlanPreview(draft)
  } catch (error) {
    if (!isTransient(error)) throw error
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    return getPlanPreview(draft)
  }
}
