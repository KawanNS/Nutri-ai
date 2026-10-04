import { apiRequest } from './api'
import type { DiaryResponse } from '../types/diary'

export function listDiaryFoodLogs(date: string): Promise<DiaryResponse> {
  const params = new URLSearchParams({
    date,
    timezoneOffsetMinutes: String(new Date().getTimezoneOffset()),
  })
  return apiRequest<DiaryResponse>(`/api/food-logs?${params}`)
}
