import type { Meal, MealPlanDay } from '../types/mealPlan'

const weekdayKeys = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']
const weekdayShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim()
}

/** Weekday (0 = Sunday) named by a plan day label such as "Segunda-feira", or null for labels like "Dia 1". */
export function weekdayOfLabel(label: string): number | null {
  const index = weekdayKeys.indexOf(normalize(label).slice(0, 3))
  return index === -1 ? null : index
}

/** Short tab text for a plan day: "Seg" for weekday labels, "Dia 3" otherwise. */
export function shortDayLabel(day: MealPlanDay): string {
  const weekday = weekdayOfLabel(day.label)
  return weekday === null ? `Dia ${day.day}` : weekdayShort[weekday]
}

function startOfLocalDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
}

/**
 * The plan day that corresponds to `now`. Plans labelled with weekday names follow the calendar;
 * otherwise day 1 is the day the plan was generated and the week repeats.
 */
export function todayPlanDay(days: MealPlanDay[], createdAt: string, now: Date): number | undefined {
  if (days.length === 0) return undefined
  const byWeekday = days.find((day) => weekdayOfLabel(day.label) === now.getDay())
  if (byWeekday) return byWeekday.day
  const ordered = [...days].sort((a, b) => a.day - b.day)
  const created = new Date(createdAt)
  const elapsed = Number.isNaN(created.getTime()) ? 0 : Math.max(0, Math.round((startOfLocalDay(now) - startOfLocalDay(created)) / 86_400_000))
  return ordered[elapsed % ordered.length].day
}

/** Minutes after midnight for times such as "07:30", "7h30", "12h" or "19:00"; null when there is no clock time. */
export function mealMinutes(suggestedTime: string | null): number | null {
  const match = suggestedTime?.match(/(\d{1,2})\s*(?:[:hH]\s*(\d{2})?)/)
  if (!match) return null
  const hours = Number(match[1]), minutes = Number(match[2] ?? 0)
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null
}

/** How long a meal still counts as "the next one" after its suggested time. */
const currentMealGraceMinutes = 30

/**
 * Index of the meal to highlight on today's tab: the first one whose time has not passed yet.
 * Returns null when no meal has a clock time, and 'done' when every timed meal is over.
 */
export function nextMealIndex(meals: Meal[], now: Date): number | 'done' | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  let timed = false
  for (const [index, meal] of meals.entries()) {
    const minutes = mealMinutes(meal.suggestedTime)
    if (minutes === null) continue
    timed = true
    if (minutes + currentMealGraceMinutes >= nowMinutes) return index
  }
  return timed ? 'done' : null
}
