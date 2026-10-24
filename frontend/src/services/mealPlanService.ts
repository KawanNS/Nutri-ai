import type { MealPlanGenerationResponse, MealPlanListResponse, MealPlanResponse, MealSwapResponse } from '../types/mealPlan'
import { apiRequest } from './api'
import type { FirstDayMeal } from './previewSeed'

export function listLatestMealPlan(): Promise<MealPlanListResponse> {
  return apiRequest<MealPlanListResponse>('/api/meal-plans?limit=1')
}

export function getMealPlan(id: string): Promise<MealPlanResponse> {
  return apiRequest<MealPlanResponse>(`/api/meal-plans/${encodeURIComponent(id)}`)
}

/** firstDayMeals: the Monday from the public preview, so the first week starts from what the person saw. */
export function generateMealPlan(idempotencyKey: string, firstDayMeals?: FirstDayMeal[]): Promise<MealPlanGenerationResponse> {
  return apiRequest<MealPlanGenerationResponse>('/api/meal-plans/generate', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(firstDayMeals?.length ? { firstDayMeals } : {}),
  })
}

export function swapMeal(mealPlanId: string, day: number, mealIndex: number): Promise<MealSwapResponse> {
  return apiRequest<MealSwapResponse>(
    `/api/meal-plans/${encodeURIComponent(mealPlanId)}/days/${day}/meals/${mealIndex}/swap`,
    { method: 'POST', body: JSON.stringify({}) },
  )
}
