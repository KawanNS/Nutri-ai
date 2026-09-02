import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../services/api'
import { generateMealPlan, getMealPlan, listLatestMealPlan } from '../services/mealPlanService'
import { getUsage } from '../services/usageService'
import type { MealPlan, Nutrition } from '../types/mealPlan'
import type { Usage } from '../types/usage'

interface MealPlanPageProps { onProfile(): void; onProgress(): void; onLogout(): void }

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

function NutritionValues({ nutrition }: { nutrition: Nutrition }) {
  return <div className="nutrition-grid">
    <span><strong>{number.format(nutrition.caloriesKcal)}</strong> kcal</span>
    <span><strong>{number.format(nutrition.proteinGrams)}</strong> g proteína</span>
    <span><strong>{number.format(nutrition.carbohydrateGrams)}</strong> g carboidratos</span>
    <span><strong>{number.format(nutrition.fatGrams)}</strong> g gorduras</span>
  </div>
}

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível concluir a solicitação. Verifique sua conexão e tente novamente.'
  switch (error.code) {
    case 'FREE_USAGE_LIMIT_REACHED': return 'Suas gerações gratuitas acabaram.'
    case 'PROFILE_NOT_FOUND': return 'Preencha seu perfil antes de gerar um plano alimentar.'
    case 'PROFILE_NOT_READY_FOR_GENERATION': return 'Alguns dados do seu perfil precisam ser revisados antes da geração.'
    case 'AI_TEMPORARILY_UNAVAILABLE': return 'A geração está temporariamente indisponível. Tente novamente em alguns instantes.'
    case 'AI_GENERATION_FAILED': return 'Não foi possível gerar seu plano agora. Tente novamente.'
    case 'AI_INVALID_RESPONSE':
    case 'INVALID_GENERATED_MEAL_PLAN': return 'Não foi possível gerar um plano válido. Inicie uma nova tentativa.'
    default:
      if (error.status === 403) return 'Seu acesso está indisponível no momento.'
      return 'Não foi possível concluir a solicitação agora. Tente novamente.'
  }
}

function shouldStartFreshAfter(error: unknown): boolean {
  return error instanceof ApiError && [
    'FREE_USAGE_LIMIT_REACHED', 'PROFILE_NOT_FOUND', 'PROFILE_NOT_READY_FOR_GENERATION',
    'AI_TEMPORARILY_UNAVAILABLE', 'AI_GENERATION_FAILED', 'AI_INVALID_RESPONSE',
    'INVALID_GENERATED_MEAL_PLAN', 'IDEMPOTENCY_KEY_FINALIZED',
  ].includes(error.code ?? '')
}

export function MealPlanPage({ onProfile, onProgress, onLogout }: MealPlanPageProps) {
  const [usage, setUsage] = useState<Usage | null>(null), [mealPlan, setMealPlan] = useState<MealPlan | null>(null)
  const [loading, setLoading] = useState(true), [generating, setGenerating] = useState(false), [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const attemptKey = useRef<string | null>(null), generatingRef = useRef(false)

  const loadPage = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [{ usage: currentUsage }, list] = await Promise.all([getUsage(), listLatestMealPlan()])
      setUsage(currentUsage)
      if (list.mealPlans[0]) setMealPlan((await getMealPlan(list.mealPlans[0].id)).mealPlan)
      else setMealPlan(null)
    } catch (requestError) {
      if (!(requestError instanceof ApiError && requestError.status === 401)) setError(errorMessage(requestError))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    // Initial loading synchronizes this authenticated view with existing API data.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadPage()
  }, [loadPage])

  async function requestGeneration(useExistingKey: boolean) {
    if (generatingRef.current) return
    const key = useExistingKey && attemptKey.current ? attemptKey.current : crypto.randomUUID()
    attemptKey.current = key; generatingRef.current = true; setGenerating(true); setError(null)
    try {
      const response = await generateMealPlan(key)
      if ('status' in response) { setPending(true); return }
      setMealPlan(response.mealPlan); setUsage(response.usage); setPending(false); attemptKey.current = null
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'FREE_USAGE_LIMIT_REACHED') {
        setUsage((current) => current ? { ...current, freeUsesAvailable: 0 } : current)
      }
      if (shouldStartFreshAfter(requestError)) { setPending(false); attemptKey.current = null }
      if (!(requestError instanceof ApiError && requestError.status === 401)) setError(errorMessage(requestError))
    } finally { generatingRef.current = false; setGenerating(false) }
  }

  const needsProfile = error?.includes('perfil'), limitReached = usage?.freeUsesAvailable === 0
  return <div className="app-shell"><header className="topbar"><div className="topbar__content"><div className="brand"><span className="brand__mark" aria-hidden="true">N</span><span>Nutri-AI</span></div><nav className="topbar__actions" aria-label="Navegação principal"><button className="nav-button nav-button--active" type="button">Plano alimentar</button><button className="nav-button" type="button" onClick={onProfile}>Perfil</button><button className="nav-button" type="button" onClick={onProgress}>Evolução</button><button className="logout-button" type="button" onClick={onLogout}>Sair</button></nav></div></header>
    <main className="page meal-plan-page"><div className="page-heading meal-plan-heading"><div><p className="eyebrow">Plano alimentar</p><h1>Comer bem, com um plano possível.</h1><p>Um cardápio de sete dias alinhado ao seu perfil, rotina e orçamento.</p></div>{usage && <div className="usage-card"><strong>{usage.freeUsesAvailable} de {usage.freeUsesLimit}</strong><span>gerações gratuitas disponíveis</span>{usage.freeUsesReserved > 0 && <small>Há uma geração em processamento.</small>}</div>}</div>
      {error && <div className="notice notice--error" role="alert">{error}{needsProfile && <button className="notice__action" type="button" onClick={onProfile}>Revisar perfil</button>}</div>}
      {pending && <div className="notice notice--info" role="status">Seu plano ainda está sendo processado. Verifique novamente em alguns instantes usando a mesma tentativa.</div>}
      {limitReached && <div className="notice notice--info">Você atingiu o limite de gerações gratuitas. Seus planos anteriores continuam disponíveis.</div>}
      {loading ? <div className="panel loading"><span className="spinner" aria-label="Carregando plano alimentar"/></div> : <>
        <div className="meal-plan-actions"><button className="button button--primary" type="button" disabled={generating || limitReached || pending} onClick={() => void requestGeneration(false)}>{generating ? 'Gerando seu plano…' : mealPlan ? 'Gerar novo plano' : 'Gerar meu plano alimentar'}</button>{pending && <button className="button button--secondary" type="button" disabled={generating} onClick={() => void requestGeneration(true)}>{generating ? 'Verificando…' : 'Verificar novamente'}</button>}</div>
        {!mealPlan && !generating && <section className="panel empty meal-plan-empty"><h2>Seu plano começa aqui.</h2><p>Quando você solicitar, a IA usará os dados do seu perfil para montar o cardápio. Nenhuma geração acontece automaticamente.</p></section>}
        {generating && <section className="panel generation-loading" aria-live="polite"><span className="spinner"/><div><h2>Preparando seu plano alimentar…</h2><p>Isso pode levar alguns instantes. Mantenha esta página aberta.</p></div></section>}
        {mealPlan && <PlanContent mealPlan={mealPlan}/>}</>}
    </main></div>
}

function PlanContent({ mealPlan }: { mealPlan: MealPlan }) {
  const plan = mealPlan.content
  return <div className="meal-plan-content">
    <section className="panel plan-overview"><p className="eyebrow">{plan.durationDays} dias</p><h2>{plan.title}</h2><p>{plan.summary}</p><div className="plan-cost"><span>Custo semanal estimado</span><strong>{currency.format(plan.estimatedWeeklyCost)}</strong></div><h3>Metas diárias</h3><NutritionValues nutrition={plan.dailyTargets}/></section>
    <section className="days-section"><div className="section-heading"><h2>Seus sete dias</h2><p>Refeições, preparo e estimativas nutricionais.</p></div>{plan.days.map((day) => <article className="panel day-card" key={day.day}><header className="day-card__header"><div><span>Dia {day.day}</span><h3>{day.label}</h3></div><strong>{currency.format(day.estimatedDailyCost)} <small>estimados</small></strong></header><div className="meals-list">{day.meals.map((meal, index) => <section className="meal-card" key={`${meal.name}-${index}`}><div className="meal-card__heading"><h4>{meal.name}</h4>{meal.suggestedTime && <time>{meal.suggestedTime}</time>}</div><ul className="food-list">{meal.foods.map((food, foodIndex) => <li key={`${food.name}-${foodIndex}`}><span>{food.name}</span><strong>{number.format(food.quantity)}&nbsp;{food.unit}</strong></li>)}</ul><p className="preparation"><strong>Preparo:</strong> {meal.preparation}</p><NutritionValues nutrition={meal.estimatedNutrition}/></section>)}</div></article>)}</section>
    <section className="panel shopping"><div className="section-heading"><h2>Lista de compras</h2><p>Organizada por categoria para facilitar sua semana.</p></div><div className="shopping-grid">{plan.shoppingList.map((group) => <article className="shopping-category" key={group.category}><h3>{group.category}</h3><ul>{group.items.map((item, index) => <li key={`${item.name}-${index}`}><span>{item.name}</span><strong>{number.format(item.quantity)}&nbsp;{item.unit}</strong></li>)}</ul></article>)}</div></section>
    <div className="plan-notes"><section className="panel"><h2>Observações</h2><ul>{plan.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></section><section className="panel safety"><h2>Avisos importantes</h2><ul>{plan.safetyNotices.map((notice, index) => <li key={index}>{notice}</li>)}</ul></section></div>
  </div>
}
