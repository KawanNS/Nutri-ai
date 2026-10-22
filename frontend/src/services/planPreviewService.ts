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
 * Keeps asking while failures look like a waking server, so the visitor keeps seeing "Montando…"
 * instead of an error. Gives up only after ~1 minute of trying; 4xx answers are final right away.
 */
export async function getPlanPreviewWithRetry(draft: ProfileOnboardingDraft, retryDelayMs = 4000, giveUpAfterMs = 60_000): Promise<PlanPreviewResponse> {
  const started = Date.now()
  for (;;) {
    try {
      return await getPlanPreview(draft)
    } catch (error) {
      if (!isTransient(error) || Date.now() - started + retryDelayMs > giveUpAfterMs) throw error
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }
  }
}
