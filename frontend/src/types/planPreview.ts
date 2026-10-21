import type { Meal, Nutrition } from './mealPlan'

export interface PlanPreview {
  label: string
  meals: Meal[]
  estimatedDailyCost: number
  totals: Nutrition
  promptVersion: string
}

export interface PlanPreviewResponse { preview: PlanPreview }
