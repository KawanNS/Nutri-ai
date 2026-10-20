import { apiRequest } from './api'
import type { DiaryFoodLog, DiaryPlanResponse, DiaryResponse } from '../types/diary'

function dayParams(date: string): URLSearchParams {
  return new URLSearchParams({
    date,
    timezoneOffsetMinutes: String(new Date().getTimezoneOffset()),
  })
}

export function listDiaryFoodLogs(date: string): Promise<DiaryResponse> {
  return apiRequest<DiaryResponse>(`/api/food-logs?${dayParams(date)}`)
}

export function getDiaryPlanMeals(date: string): Promise<DiaryPlanResponse> {
  return apiRequest<DiaryPlanResponse>(`/api/food-logs/plan-meals?${dayParams(date)}`)
}

export function logDiaryPlanMeal(input: { mealPlanId: string; day: number; mealIndex: number; date: string }): Promise<{ foodLog: DiaryFoodLog }> {
  return apiRequest<{ foodLog: DiaryFoodLog }>('/api/food-logs/plan-meals', {
    method: 'POST',
    body: JSON.stringify({ ...input, timezoneOffsetMinutes: new Date().getTimezoneOffset() }),
  })
}
