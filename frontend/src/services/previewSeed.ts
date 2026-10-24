import type { PlanPreview } from '../types/planPreview'

/** A meal from the public preview: names only, the first real plan recalculates quantities for the profile. */
export interface FirstDayMeal { name: string; foods: string[] }

const STORAGE_KEY = 'alyvora_preview_first_day'
// Long enough to cover sign-up and filling in the profile, short enough not to steer a plan weeks later.
const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000

/**
 * Keeps the Monday a visitor saw in the preview until the first plan is generated, so the week starts from
 * it. Stored in localStorage because the sign-up can go through a Google popup or a reload.
 */
export function savePreviewFirstDay(preview: PlanPreview): void {
  const meals: FirstDayMeal[] = preview.meals.map((meal) => ({ name: meal.name, foods: meal.foods.map((food) => food.name) }))
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ meals, savedAt: Date.now() })) } catch { /* Storage blocked: the plan is generated without it. */ }
}

export function loadPreviewFirstDay(): FirstDayMeal[] | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { meals?: FirstDayMeal[]; savedAt?: number } | null
    if (!saved?.meals?.length || typeof saved.savedAt !== 'number' || Date.now() - saved.savedAt > MAX_AGE_MS) return undefined
    return saved.meals
  } catch { return undefined }
}

export function clearPreviewFirstDay(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* Nothing to clear. */ }
}
