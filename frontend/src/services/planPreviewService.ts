import { apiRequest } from './api'
import type { PlanPreviewResponse } from '../types/planPreview'
import type { ProfileOnboardingDraft } from '../types/profile'

/** Public: one day of the plan from the onboarding answers, before an account exists. */
export function getPlanPreview(draft: ProfileOnboardingDraft): Promise<PlanPreviewResponse> {
  return apiRequest<PlanPreviewResponse>('/api/plan-preview', { method: 'POST', body: JSON.stringify(draft) })
}
