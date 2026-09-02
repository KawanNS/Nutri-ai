import type { MealPlanGenerationResponse, MealPlanListResponse, MealPlanResponse } from '../types/mealPlan'
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
