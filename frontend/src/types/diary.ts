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
