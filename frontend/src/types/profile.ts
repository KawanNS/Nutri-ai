export type Sex = 'MALE' | 'FEMALE' | 'OTHER'
export type Goal = 'WEIGHT_LOSS' | 'MAINTENANCE' | 'WEIGHT_GAIN' | 'MUSCLE_GAIN'
export type ActivityLevel = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE'

export interface ProfilePayload {
  birthDate: string
  sex: Sex
  heightCm: string
  weightKg: string
  goal: Goal
  activityLevel: ActivityLevel
  mealsPerDay: number
  weeklyFoodBudget: string
  foodPreferences: string[]
  likedFoods: string[]
  dislikedFoods: string[]
  foodRestrictions: string[]
  foodAllergies: string[]
}

export interface Profile extends ProfilePayload {
  id: string
  userId: string
  createdAt: string
  updatedAt: string
}

export interface ProfileResponse { profile: Profile }
