import { apiRequest } from './api'
import type { FoodLog, MealPhotoAnalysis, MealPhotoFood } from '../types/mealPhoto'

export const analyzeMealPhoto = (image: File) =>
  apiRequest<{ analysis: MealPhotoAnalysis }>('/api/meal-photo/analyze', {
    method: 'POST',
    body: image,
  })

export const confirmMealPhoto = (payload: {
  foods: MealPhotoFood[]
  notes: string | null
  uncertaintyNotes: string[]
}) => apiRequest<{ foodLog: FoodLog }>('/api/meal-photo/confirm', {
  method: 'POST',
  body: JSON.stringify(payload),
})
