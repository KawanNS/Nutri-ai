import type { Usage } from './usage'

export interface Nutrition {
  caloriesKcal: number
  proteinGrams: number
  carbohydrateGrams: number
  fatGrams: number
}

export interface Food {
  name: string
  quantity: number
  unit: string
}

export interface Meal {
  name: string
  suggestedTime: string | null
  foods: Food[]
  preparation: string
  estimatedNutrition: Nutrition
}

export interface MealPlanDay {
  day: number
  label: string
  meals: Meal[]
  estimatedDailyCost: number
}

export interface ShoppingCategory { category: string; items: Food[] }

export interface MealPlanContent {
  title: string
  summary: string
  durationDays: 7
  currency: 'BRL'
  dailyTargets: Nutrition
  days: MealPlanDay[]
  shoppingList: ShoppingCategory[]
  estimatedWeeklyCost: number
  notes: string[]
  safetyNotices: string[]
}

export interface MealPlan {
  id: string
  title: string
  content: MealPlanContent
  model: string
  promptVersion: string
  schemaVersion: number
  openaiResponseId: string | null
  createdAt: string
  updatedAt: string
  userId?: string
  usageEventId?: string
  profileSnapshot?: unknown
}

export interface MealPlanSummary {
  id: string
  title: string
  model: string
  promptVersion: string
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

export interface MealPlanListResponse { mealPlans: MealPlanSummary[]; nextCursor: string | null }
export interface MealPlanResponse { mealPlan: MealPlan }
export interface MealPlanGenerationSuccess extends MealPlanResponse { usage: Usage }
export interface MealPlanGenerationPending { status: 'PENDING'; operationId: string }
export type MealPlanGenerationResponse = MealPlanGenerationSuccess | MealPlanGenerationPending
