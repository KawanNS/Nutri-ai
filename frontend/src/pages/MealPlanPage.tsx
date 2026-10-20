import { useCallback, useEffect, useRef, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { LoadingState } from '../components/ui/LoadingState'
import { Surface } from '../components/ui/Surface'
import { ApiError } from '../services/api'
import { generateMealPlan, getMealPlan, listLatestMealPlan, swapMeal } from '../services/mealPlanService'
import { getUsage } from '../services/usageService'
import { getSubscription } from '../services/billingService'
import { Paywall } from '../components/Paywall'
import { AppTopbar } from '../components/layout/AppTopbar'
import type { Meal, MealPlan, MealPlanDay, Nutrition } from '../types/mealPlan'
import type { Usage } from '../types/usage'
import './MealPlanPage.css'

interface MealPlanPageProps { onProfile(): void; onChat(): void; onMealPhoto(): void; onDiary(): void; onProgress(): void }

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const generationAttemptStorageKey = 'nutri-ai:meal-plan-generation-attempt'

const nutritionLabels = [
  ['caloriesKcal', 'Calorias', 'kcal'],
  ['proteinGrams', 'Proteínas', 'g'],
  ['carbohydrateGrams', 'Carboidratos', 'g'],
  ['fatGrams', 'Gorduras', 'g'],
] as const

function NutritionValues({ nutrition, compact = false }: { nutrition: Nutrition; compact?: boolean }) {
  return <dl className={compact ? 'mp-nutrition mp-nutrition--compact' : 'mp-nutrition'}>
    {nutritionLabels.map(([key, label, unit]) => <div key={key}>
      <dt>{label}</dt>
      <dd><strong>{number.format(nutrition[key])}</strong> <span>{unit}</span></dd>
    </div>)}
  </dl>
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

function swapErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível trocar esta refeição. Verifique sua conexão e tente novamente.'
  switch (error.code) {
    case 'PREMIUM_REQUIRED': return 'Trocar refeições é um recurso Premium.'
    case 'MEAL_SWAP_RATE_LIMIT_EXCEEDED': return 'Você fez muitas trocas seguidas. Aguarde alguns minutos e tente novamente.'
    case 'MEAL_SWAP_TEMPORARILY_UNAVAILABLE': return 'A troca está temporariamente indisponível. Tente novamente em alguns instantes.'
    case 'MEAL_SWAP_INVALID_RESPONSE': return 'Não conseguimos montar uma alternativa válida. Tente novamente.'
    case 'MEAL_CHANGED_DURING_SWAP':
    case 'MEAL_PLAN_UPDATE_CONFLICT': return 'Esta refeição mudou enquanto a troca acontecia. Recarregue a página e tente de novo.'
    case 'MEAL_PLAN_NOT_SWAPPABLE': return 'Este plano é de uma versão antiga e não pode ser editado. Gere um novo plano para trocar refeições.'
    case 'PROFILE_NOT_FOUND':
    case 'PROFILE_NOT_READY_FOR_GENERATION': return 'Revise seu perfil antes de trocar refeições.'
    default: return 'Não foi possível trocar esta refeição agora. Tente novamente.'
  }
}

function shouldStartFreshAfter(error: unknown): boolean {
  return error instanceof ApiError && [
    'FREE_USAGE_LIMIT_REACHED', 'PROFILE_NOT_FOUND', 'PROFILE_NOT_READY_FOR_GENERATION',
    'AI_TEMPORARILY_UNAVAILABLE', 'AI_GENERATION_FAILED', 'AI_INVALID_RESPONSE',
    'INVALID_GENERATED_MEAL_PLAN', 'IDEMPOTENCY_KEY_FINALIZED',
  ].includes(error.code ?? '')
}

export function MealPlanPage({ onProfile, onChat, onMealPhoto, onDiary, onProgress }: MealPlanPageProps) {
  const [usage, setUsage] = useState<Usage | null>(null), [mealPlan, setMealPlan] = useState<MealPlan | null>(null)
  const [loading, setLoading] = useState(true), [generating, setGenerating] = useState(false), [pending, setPending] = useState(false)
  const [hasAttemptKey, setHasAttemptKey] = useState(() => sessionStorage.getItem(generationAttemptStorageKey) !== null)
  const [error, setError] = useState<string | null>(null)
  const attemptKey = useRef<string | null>(sessionStorage.getItem(generationAttemptStorageKey)), generatingRef = useRef(false)

  function clearGenerationAttempt() {
    attemptKey.current = null
    sessionStorage.removeItem(generationAttemptStorageKey)
    setHasAttemptKey(false)
  }

  const loadPage = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [{ usage: currentUsage }, list, { subscription }] = await Promise.all([getUsage(), listLatestMealPlan(), getSubscription()])
      // Billing access goes last: it is role-aware, so ADMIN accounts show as Premium.
      setUsage({ ...currentUsage, ...subscription })
      setPending(currentUsage.freeUsesReserved > 0)
      if (currentUsage.freeUsesReserved === 0) clearGenerationAttempt()
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
    if (useExistingKey && !attemptKey.current) return
    const key = useExistingKey && attemptKey.current ? attemptKey.current : crypto.randomUUID()
    attemptKey.current = key; sessionStorage.setItem(generationAttemptStorageKey, key); setHasAttemptKey(true); generatingRef.current = true; setGenerating(true); setError(null)
    try {
      const response = await generateMealPlan(key)
      if ('status' in response) { setPending(true); return }
      setMealPlan(response.mealPlan); setUsage((current) => current ? { ...current, ...response.usage } : response.usage); setPending(false); clearGenerationAttempt()
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'FREE_USAGE_LIMIT_REACHED') {
        setUsage((current) => current ? { ...current, freeUsesAvailable: 0 } : current)
      }
      if (shouldStartFreshAfter(requestError)) { setPending(false); clearGenerationAttempt() }
      if (!(requestError instanceof ApiError && requestError.status === 401)) setError(errorMessage(requestError))
    } finally { generatingRef.current = false; setGenerating(false) }
  }

  const needsProfile = error?.includes('perfil'), limitReached = usage?.isPremium === false && usage.freeUsesAvailable === 0
  const generationLabel = mealPlan ? 'Gerar novo plano' : 'Gerar meu plano'

  return <div className="app-shell"><AppTopbar active="meal-plan" onChat={onChat} onDiary={onDiary} onProgress={onProgress}/>
    <main className="page meal-plan-page">
      <PageHeader
        className="mp-page-header"
        eyebrow="Plano alimentar"
        title="Seu plano alimentar"
        description="Organizado de acordo com seu perfil, objetivo, rotina e orçamento."
        actions={usage ? <UsageSummary usage={usage}/> : undefined}
      />

      <div className="mp-actions" aria-label="Ações do plano alimentar">
        <Button loading={generating} loadingLabel="Gerando seu plano" disabled={limitReached || pending} onClick={() => void requestGeneration(false)}>{generationLabel}</Button>
        {pending && hasAttemptKey && <Button variant="secondary" loading={generating} loadingLabel="Verificando geração" onClick={() => void requestGeneration(true)}>Verificar novamente</Button>}
        <Button variant="ghost" onClick={onMealPhoto}>Analisar foto do prato</Button>
        <span>Revise as estimativas da foto antes de registrar.</span>
      </div>

      <div className="mp-feedback">
        {error && <Alert variant="error" title="Não foi possível concluir">{error}{needsProfile && <Button className="mp-alert-action" variant="ghost" onClick={onProfile}>Revisar perfil</Button>}</Alert>}
        {pending && <Alert variant="info" title="Geração em processamento">Seu plano ainda está sendo processado. Verifique novamente em alguns instantes usando a mesma tentativa.</Alert>}
        {limitReached && <Alert variant="info" title="Limite gratuito alcançado">Seus planos anteriores continuam disponíveis. Para criar novos planos, escolha uma assinatura Premium.</Alert>}
      </div>

      {limitReached && <Paywall/>}
      {loading ? <Surface className="mp-state" level="base"><LoadingState label="Carregando seu plano alimentar" description="Buscando seu plano, seu acesso e suas gerações disponíveis."/></Surface> : <>
        {!mealPlan && !generating && <EmptyPlanState/>}
        {generating && <Surface className="mp-state mp-state--generation" level="soft"><LoadingState label="Montando seu plano alimentar…" description="Estamos organizando sete dias de refeições com base no seu perfil. Isso pode levar alguns instantes; mantenha esta página aberta."/></Surface>}
        {mealPlan && <PlanContent key={mealPlan.id} mealPlan={mealPlan} canSwap={usage?.isPremium === true} onPlanUpdated={setMealPlan}/>}
      </>}
    </main>
  </div>
}

function UsageSummary({ usage }: { usage: Usage }) {
  if (usage.adminAccess) return <div className="mp-usage"><Badge variant="success">Premium (admin)</Badge><span>Novas gerações liberadas para administradores</span></div>
  if (usage.isPremium) return <div className="mp-usage"><Badge variant="success">Premium ativo</Badge><span>Novas gerações liberadas pela assinatura</span></div>
  return <div className="mp-usage"><strong>{usage.freeUsesAvailable}</strong><span>{usage.freeUsesAvailable === 1 ? 'geração gratuita restante' : 'gerações gratuitas restantes'}</span>{usage.freeUsesReserved > 0 && <small>Uma geração está em processamento.</small>}</div>
}

function EmptyPlanState() {
  return <Surface as="section" className="mp-empty" level="soft" aria-labelledby="mp-empty-title">
    <span className="mp-empty__mark" aria-hidden="true">7</span>
    <div><p className="mp-kicker">Sua semana, organizada</p><h2 id="mp-empty-title">Seu plano começa aqui.</h2><p>Quando você solicitar, a IA usará os dados do seu perfil para montar o cardápio. Nenhuma geração acontece automaticamente.</p></div>
  </Surface>
}

type SwapFeedback = { kind: 'error' | 'info' | 'success'; message: string }

function PlanContent({ mealPlan, canSwap, onPlanUpdated }: { mealPlan: MealPlan; canSwap: boolean; onPlanUpdated(mealPlan: MealPlan): void }) {
  const plan = mealPlan.content
  const [selectedDayNumber, setSelectedDayNumber] = useState(plan.days[0]?.day ?? 1)
  const selectedDay = plan.days.find((day) => day.day === selectedDayNumber) ?? plan.days[0]
  const [swappingKey, setSwappingKey] = useState<string | null>(null)
  const [swapFeedback, setSwapFeedback] = useState<Record<string, SwapFeedback>>({})
  const swappingRef = useRef(false)

  async function requestSwap(day: number, mealIndex: number) {
    const key = `${day}-${mealIndex}`
    if (!canSwap) {
      setSwapFeedback((current) => ({ ...current, [key]: { kind: 'info', message: 'Trocar uma refeição sem gerar o plano de novo é um recurso Premium.' } }))
      return
    }
    // One swap at a time keeps the shared rate limit for real retries.
    if (swappingRef.current) return
    swappingRef.current = true; setSwappingKey(key)
    setSwapFeedback((current) => { const next = { ...current }; delete next[key]; return next })
    try {
      const response = await swapMeal(mealPlan.id, day, mealIndex)
      onPlanUpdated(response.mealPlan)
      setSwapFeedback((current) => ({ ...current, [key]: { kind: 'success', message: 'Refeição trocada. O custo do dia e a lista de compras foram atualizados.' } }))
    } catch (requestError) {
      if (!(requestError instanceof ApiError && requestError.status === 401)) {
        setSwapFeedback((current) => ({ ...current, [key]: { kind: 'error', message: swapErrorMessage(requestError) } }))
      }
    } finally { swappingRef.current = false; setSwappingKey(null) }
  }

  return <div className="mp-content">
    <Surface as="section" className="mp-overview" level="base" aria-labelledby="mp-plan-title">
      <div className="mp-overview__intro"><div className="mp-overview__badges"><Badge>{plan.durationDays} dias</Badge><Badge>{plan.days.reduce((total, day) => total + day.meals.length, 0)} refeições</Badge></div><h2 id="mp-plan-title">{plan.title}</h2><p>{plan.summary}</p></div>
      <div className="mp-overview__cost"><span>Custo semanal estimado</span><strong>{currency.format(plan.estimatedWeeklyCost)}</strong></div>
      <div className="mp-targets"><div><p className="mp-kicker">Resumo diário</p><h3>Metas estimadas do plano</h3></div><NutritionValues nutrition={plan.dailyTargets}/></div>
    </Surface>

    <section className="mp-week" aria-labelledby="mp-week-title">
      <div className="mp-section-heading"><div><p className="mp-kicker">Sua semana</p><h2 id="mp-week-title">Refeições do dia</h2></div><p>Escolha um dia para consultar refeições, preparo e estimativas nutricionais.</p></div>
      <DayNavigation days={plan.days} selectedDay={selectedDayNumber} onSelect={setSelectedDayNumber}/>
      {selectedDay && <DayContent day={selectedDay} swappingKey={swappingKey} swapFeedback={swapFeedback} onSwap={(mealIndex) => void requestSwap(selectedDay.day, mealIndex)}/>}
    </section>

    <Surface as="section" className="mp-shopping" level="base" aria-labelledby="mp-shopping-title">
      <div className="mp-section-heading"><div><p className="mp-kicker">Para a semana</p><h2 id="mp-shopping-title">Lista de compras</h2></div><p>Quantidades organizadas por categoria conforme o plano gerado.</p></div>
      <div className="mp-shopping__grid">{plan.shoppingList.map((group, groupIndex) => <article className="mp-shopping__category" key={`${group.category}-${groupIndex}`}><h3>{group.category}</h3><ul>{group.items.map((item, index) => <li key={`${item.name}-${index}`}><span>{item.name}</span><strong>{number.format(item.quantity)}&nbsp;{item.unit}</strong></li>)}</ul></article>)}</div>
    </Surface>

    <Surface as="section" className="mp-notes" level="soft" aria-label="Observações e avisos do plano">
      <div><h2>Observações</h2><ul>{plan.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></div>
      <div className="mp-notes__safety"><h2>Avisos importantes</h2><ul>{plan.safetyNotices.map((notice, index) => <li key={index}>{notice}</li>)}</ul></div>
    </Surface>
  </div>
}

function DayNavigation({ days, selectedDay, onSelect }: { days: MealPlanDay[]; selectedDay: number; onSelect(day: number): void }) {
  return <nav className="mp-day-nav" aria-label="Dias do plano alimentar">
    {days.map((day) => {
      const selected = day.day === selectedDay
      return <button key={day.day} type="button" aria-pressed={selected} aria-label={`Ver ${day.label}`} onClick={() => onSelect(day.day)}><span>{day.label.slice(0, 3).toLocaleUpperCase('pt-BR')}</span><strong>{day.day}</strong></button>
    })}
  </nav>
}

interface DayContentProps { day: MealPlanDay; swappingKey: string | null; swapFeedback: Record<string, SwapFeedback>; onSwap(mealIndex: number): void }

function DayContent({ day, swappingKey, swapFeedback, onSwap }: DayContentProps) {
  return <Surface as="article" className="mp-day" level="base" aria-labelledby={`mp-day-title-${day.day}`}>
    <header className="mp-day__header"><div><span>Dia {day.day}</span><h3 id={`mp-day-title-${day.day}`}>{day.label}</h3></div><div><small>Custo diário estimado</small><strong>{currency.format(day.estimatedDailyCost)}</strong></div></header>
    <div className="mp-meals">{day.meals.map((meal, index) => {
      const key = `${day.day}-${index}`
      return <MealPresentation meal={meal} index={index} key={`${meal.name}-${index}`} swapping={swappingKey === key} swapDisabled={swappingKey !== null && swappingKey !== key} feedback={swapFeedback[key]} onSwap={() => onSwap(index)}/>
    })}</div>
  </Surface>
}

interface MealPresentationProps { meal: Meal; index: number; swapping: boolean; swapDisabled: boolean; feedback?: SwapFeedback; onSwap(): void }

function MealPresentation({ meal, index, swapping, swapDisabled, feedback, onSwap }: MealPresentationProps) {
  return <article className={swapping ? 'mp-meal mp-meal--swapping' : 'mp-meal'} aria-busy={swapping || undefined}>
    <header className="mp-meal__header"><span>{String(index + 1).padStart(2, '0')}</span><div><h4>{meal.name}</h4>{meal.suggestedTime && <time>{meal.suggestedTime}</time>}</div><Button className="mp-meal__swap" variant="ghost" loading={swapping} loadingLabel="Trocando esta refeição" disabled={swapDisabled} aria-label={`Trocar esta refeição: ${meal.name}`} onClick={onSwap}>Trocar refeição</Button></header>
    {swapping && <p className="mp-meal__swap-status" role="status">Buscando uma alternativa equivalente…</p>}
    {feedback && (feedback.kind === 'error'
      ? <p className="mp-meal__swap-feedback mp-meal__swap-feedback--error" role="alert">{feedback.message}</p>
      : <p className={`mp-meal__swap-feedback mp-meal__swap-feedback--${feedback.kind}`} role="status">{feedback.message}</p>)}
    <div className="mp-meal__body"><div className="mp-foods"><h5>Alimentos</h5><ul>{meal.foods.map((food, foodIndex) => <li key={`${food.name}-${foodIndex}`}><span>{food.name}</span><strong>{number.format(food.quantity)}&nbsp;{food.unit}</strong></li>)}</ul></div><div className="mp-preparation"><h5>Preparo</h5><p>{meal.preparation}</p></div><div className="mp-meal__nutrition"><h5>Estimativa nutricional</h5><NutritionValues nutrition={meal.estimatedNutrition} compact/></div></div>
  </article>
}
