import type { Nutrition } from './mealPlan'

export interface DiaryFoodLogItem {
  id: string
  name: string
  portionDescription: string
}

export interface DiaryFoodLog {
  id: string
  consumedAt: string
  estimatedCaloriesKcal: number | null
  estimatedProteinGrams: number | null
  estimatedCarbohydrateGrams: number | null
  estimatedFatGrams: number | null
  notes: string | null
  items: DiaryFoodLogItem[]
}

export interface DiaryResponse {
  date: string
  foodLogs: DiaryFoodLog[]
}

export interface DiaryPlanMeal {
  index: number
  name: string
  suggestedTime: string | null
  foods: Array<{ name: string; quantity: number; unit: string }>
  estimatedNutrition: Nutrition
  logged: boolean
}

export interface DiaryPlanDay {
  mealPlanId: string
  day: number
  label: string
  dailyTargets: Nutrition
  meals: DiaryPlanMeal[]
}

export interface DiaryPlanResponse {
  date: string
  plan: DiaryPlanDay | null
}
