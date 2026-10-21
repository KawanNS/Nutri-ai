import type { MealPlanGenerationResponse, MealPlanListResponse, MealPlanResponse, MealSwapResponse } from '../types/mealPlan'
import { apiRequest } from './api'

export function listLatestMealPlan(): Promise<MealPlanListResponse> {
  return apiRequest<MealPlanListResponse>('/api/meal-plans?limit=1')
}

export function getMealPlan(id: string): Promise<MealPlanResponse> {
  return apiRequest<MealPlanResponse>(`/api/meal-plans/${encodeURIComponent(id)}`)
}

export function generateMealPlan(idempotencyKey: string): Promise<MealPlanGenerationResponse> {
  return apiRequest<MealPlanGenerationResponse>('/api/meal-plans/generate', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({}),
  })
}

export function swapMeal(mealPlanId: string, day: number, mealIndex: number): Promise<MealSwapResponse> {
  return apiRequest<MealSwapResponse>(
    `/api/meal-plans/${encodeURIComponent(mealPlanId)}/days/${day}/meals/${mealIndex}/swap`,
    { method: 'POST', body: JSON.stringify({}) },
  )
}
