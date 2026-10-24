import type { MealPlanGenerationResponse, MealPlanListResponse, MealPlanResponse, MealSwapResponse } from '../types/mealPlan'
import { ApiError, apiRequest } from './api'
import type { FirstDayMeal } from './previewSeed'

export function listLatestMealPlan(): Promise<MealPlanListResponse> {
  return apiRequest<MealPlanListResponse>('/api/meal-plans?limit=1')
}

export function getMealPlan(id: string): Promise<MealPlanResponse> {
  return apiRequest<MealPlanResponse>(`/api/meal-plans/${encodeURIComponent(id)}`)
}

/** firstDayMeals: the Monday from the public preview, so the first week starts from what the person saw. */
export async function generateMealPlan(idempotencyKey: string, firstDayMeals?: FirstDayMeal[]): Promise<MealPlanGenerationResponse> {
  const request = (body: object) => apiRequest<MealPlanGenerationResponse>('/api/meal-plans/generate', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  })
  if (!firstDayMeals?.length) return request({})
  try {
    return await request({ firstDayMeals })
  } catch (error) {
    // An API that does not know firstDayMeals yet (deploys land at different times) still builds a week.
    if (error instanceof ApiError && error.code === 'INVALID_GENERATION_BODY') return request({})
    throw error
  }
}

export function swapMeal(mealPlanId: string, day: number, mealIndex: number): Promise<MealSwapResponse> {
  return apiRequest<MealSwapResponse>(
    `/api/meal-plans/${encodeURIComponent(mealPlanId)}/days/${day}/meals/${mealIndex}/swap`,
    { method: 'POST', body: JSON.stringify({}) },
  )
}
