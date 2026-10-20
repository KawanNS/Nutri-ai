import { Button } from '../ui/Button'
import { Surface } from '../ui/Surface'
import type { DiaryPlanDay } from '../../types/diary'
import type { Nutrition } from '../../types/mealPlan'
import './DiaryPlanMeals.css'

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

interface DiaryPlanMealsProps {
  plan: DiaryPlanDay
  isToday: boolean
  loggingIndex: number | null
  error: string | null
  onLog(mealIndex: number): void
}

/** The plan's meals for the selected day, each one logged to the diary with a single tap. */
export function DiaryPlanMeals({ plan, isToday, loggingIndex, error, onLog }: DiaryPlanMealsProps) {
  const pending = plan.meals.filter((meal) => !meal.logged).length
  return <Surface as="section" className="diary-plan" aria-labelledby="diary-plan-title">
    <div className="diary-section-heading">
      <div><p>Do seu plano · {plan.label}</p><h2 id="diary-plan-title">{isToday ? 'Comeu o que estava no plano?' : 'O que estava no plano neste dia'}</h2></div>
      <span>{pending === 0 ? 'Tudo marcado' : 'Marque com um toque'}</span>
    </div>
    {error && <p className="diary-plan__error" role="alert">{error}</p>}
    <ul className="diary-plan__meals">
      {plan.meals.map((meal) => <li className={meal.logged ? 'diary-plan__meal diary-plan__meal--logged' : 'diary-plan__meal'} key={meal.index}>
        <div className="diary-plan__copy">
          <strong>{meal.suggestedTime && <time>{meal.suggestedTime}</time>}{meal.name}</strong>
          <span>{meal.foods.map((food) => food.name).join(', ')}</span>
          <small>{number.format(meal.estimatedNutrition.caloriesKcal)} kcal · {number.format(meal.estimatedNutrition.proteinGrams)} g de proteína</small>
        </div>
        {meal.logged
          ? <span className="diary-plan__done"><span aria-hidden="true">✓</span> No diário</span>
          : <Button variant="secondary" aria-label={`Comi isso: ${meal.name}`} loading={loggingIndex === meal.index} loadingLabel={`Registrando ${meal.name}`} disabled={loggingIndex !== null} onClick={() => onLog(meal.index)}>Comi isso</Button>}
      </li>)}
    </ul>
  </Surface>
}

interface DiaryDayTargetProps {
  calories: number | null
  targets: Nutrition
}

/** Registered calories against the plan's daily target, worded without judging the result. */
export function DiaryDayTarget({ calories, targets }: DiaryDayTargetProps) {
  const target = targets.caloriesKcal
  if (target <= 0) return null
  const share = calories === null ? 0 : Math.min(calories / target, 1)
  const difference = calories === null ? 0 : Math.round(target - calories)
  const status = calories === null
    ? 'Algum registro do dia está sem estimativa de calorias.'
    : Math.abs(difference) <= target * 0.05
      ? 'Bem perto da meta do plano.'
      : difference > 0
        ? `Faltam ${number.format(difference)} kcal para a meta do plano.`
        : `${number.format(-difference)} kcal acima da meta do plano.`
  return <div className="diary-target">
    <p><strong>{calories === null ? '—' : number.format(calories)} de {number.format(target)} kcal</strong><span>{status}</span></p>
    <div className="diary-target__bar" aria-hidden="true"><i style={{ width: `${share * 100}%` }}/></div>
  </div>
}
