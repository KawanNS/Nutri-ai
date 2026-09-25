export type FoodEstimateConfidence = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH'

export interface MealPhotoFood {
  name: string
  portionDescription: string
  estimatedCaloriesKcal: number | null
  estimatedProteinGrams: number | null
  estimatedCarbohydrateGrams: number | null
  estimatedFatGrams: number | null
  confidence: FoodEstimateConfidence
  limitations: string[]
}

export interface MealPhotoAnalysis {
  isEstimate: true
  foods: MealPhotoFood[]
  observations: string[]
  undeterminedItems: string[]
}

export interface FoodLogItem extends Omit<MealPhotoFood, 'limitations'> {
  id: string
  foodLogId: string
  position: number
  createdAt: string
  updatedAt: string
}

export interface FoodLog {
  id: string
  userId: string
  consumedAt: string
  confirmedAt: string
  estimatedCaloriesKcal: number | null
  estimatedProteinGrams: number | null
  estimatedCarbohydrateGrams: number | null
  estimatedFatGrams: number | null
  notes: string | null
  uncertaintyNotes: string[]
  createdAt: string
  updatedAt: string
  items: FoodLogItem[]
}
