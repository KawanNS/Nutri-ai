import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
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
import { CountUp } from '../components/motion/CountUp'
import { MacroBar } from '../components/motion/MacroBar'
import { SpotlightCard } from '../components/motion/SpotlightCard'
import type { Meal, MealPlan, MealPlanDay, Nutrition } from '../types/mealPlan'
import type { Usage } from '../types/usage'
import { nextMealIndex, shortDayLabel, todayPlanDay } from '../utils/mealPlanSchedule'
import './MealPlanPage.css'

interface MealPlanPageProps { onProfile(): void; onChat(): void; onMealPhoto(): void; onDiary(): void; onProgress(): void }

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const whole = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const formatWhole = (value: number) => whole.format(value)
const formatCurrency = (value: number) => currency.format(value)

/** The brand green the spotlight cards glow with (React Bits' SpotlightCard on the app's light surface). */
const spotlight = { theme: 'light', spotlightColor: 'var(--brand-green)', intensity: 0.7, borderGlow: 0.9, spotlightSize: 320, style: { '--spotlight-card-surface': 'var(--surface)', '--spotlight-card-border': 'var(--border)', '--spotlight-card-shadow': 'var(--shadow-soft)' } as CSSProperties } as const
const generationAttemptStorageKey = 'nutri-ai:meal-plan-generation-attempt'

const nutritionLabels = [
  ['caloriesKcal', 'Calorias', 'kcal'],
  ['proteinGrams', 'Proteínas', 'g'],
  ['carbohydrateGrams', 'Carboidratos', 'g'],
  ['fatGrams', 'Gorduras', 'g'],
] as const

function NutritionValues({ nutrition, compact = false }: { nutrition: Nutrition; compact?: boolean }) {
  return <dl className={compact ? 'ui-stat-row mp-nutrition mp-nutrition--compact' : 'ui-stat-row mp-nutrition'}>
    {nutritionLabels.map(([key, label, unit]) => <div key={key}>
      <dt>{label}</dt>
      <dd>{number.format(nutrition[key])}<span>{unit}</span></dd>
    </div>)}
  </dl>
}

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não deu para falar com o servidor. Confira sua internet e tente de novo.'
  switch (error.code) {
    case 'FREE_USAGE_LIMIT_REACHED': return 'Seus cardápios grátis acabaram.'
    case 'PROFILE_NOT_FOUND': return 'Complete seu perfil para a gente montar seu cardápio.'
    case 'PROFILE_NOT_READY_FOR_GENERATION': return 'Falta conferir alguns dados do seu perfil antes de montar o cardápio.'
    case 'AI_TEMPORARILY_UNAVAILABLE': return 'A montagem de cardápios está fora do ar agora. Tente de novo em alguns minutos.'
    case 'AI_GENERATION_FAILED': return 'Não deu para montar seu plano agora. Tente de novo.'
    case 'AI_INVALID_RESPONSE':
    case 'INVALID_GENERATED_MEAL_PLAN': return 'O plano saiu com erro. Peça um novo.'
    default:
      if (error.status === 403) return 'Seu acesso está indisponível no momento.'
      return 'Algo deu errado. Tente de novo.'
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
    <main className="page page--narrow meal-plan-page">
      <PageHeader
        className="mp-page-header"
        title="Plano alimentar"
        actions={<Button variant="secondary" onClick={onMealPhoto}>Foto do prato</Button>}
      />

      <div className="mp-feedback">
        {error && <Alert variant="error" title="Não foi possível concluir">{error}{needsProfile && <Button className="mp-alert-action" variant="ghost" onClick={onProfile}>Revisar perfil</Button>}</Alert>}
        {pending && <Alert variant="info" title="Ainda montando seu plano">Ele ainda não ficou pronto. Toque em “Verificar novamente” daqui a pouco.{hasAttemptKey && <Button className="mp-alert-action" variant="secondary" loading={generating} loadingLabel="Verificando geração" onClick={() => void requestGeneration(true)}>Verificar novamente</Button>}</Alert>}
        {limitReached && <Alert variant="info" title="Os cardápios grátis acabaram">Os planos que você já gerou continuam aqui. Para gerar novos, assine o Premium.</Alert>}
      </div>

      {loading ? <Surface className="mp-state" level="base"><LoadingState label="Carregando seu plano alimentar" description="Buscando seu último plano."/></Surface> : <>
        {!mealPlan && !generating && <EmptyPlanState/>}
        {generating && <Surface className="mp-state mp-state--generation" level="soft"><LoadingState label="Montando seu plano alimentar…" description="Sete dias de refeições, com preparo e lista de compras. Leva um tempinho; deixe esta página aberta."/></Surface>}
        {mealPlan && !generating && <PlanContent key={mealPlan.id} mealPlan={mealPlan} onMealPhoto={onMealPhoto} canSwap={usage?.isPremium === true} onPlanUpdated={setMealPlan}/>}

        <section className={mealPlan ? 'mp-generate' : 'mp-generate mp-generate--first'} aria-label="Gerar plano alimentar">
          {usage && <UsageSummary usage={usage}/>}
          <Button variant={mealPlan ? 'secondary' : 'primary'} loading={generating} loadingLabel="Gerando seu plano" disabled={limitReached || pending} onClick={() => void requestGeneration(false)}>{generationLabel}</Button>
        </section>
        {limitReached && <Paywall/>}
      </>}
    </main>
  </div>
}

function UsageSummary({ usage }: { usage: Usage }) {
  if (usage.adminAccess) return <div className="mp-usage"><Badge variant="success">Premium (admin)</Badge><span>Planos novos liberados para administradores</span></div>
  if (usage.isPremium) return <div className="mp-usage"><Badge variant="success">Premium ativo</Badge><span>Planos novos liberados pela assinatura</span></div>
  return <div className="mp-usage"><span><strong>{usage.freeUsesAvailable}</strong> {usage.freeUsesAvailable === 1 ? 'cardápio grátis restante' : 'cardápios grátis restantes'}</span>{usage.freeUsesReserved > 0 && <small>Um plano está sendo montado.</small>}</div>
}

function EmptyPlanState() {
  return <section className="mp-empty" aria-labelledby="mp-empty-title">
    <h2 id="mp-empty-title">Seu plano começa aqui.</h2>
    <p>Toque em “Gerar meu plano” e a Alyvora monta sete dias de refeições com o que está no seu perfil, do café ao jantar, com a lista de compras.</p>
  </section>
}

function dayNutrition(day: MealPlanDay): Nutrition {
  return day.meals.reduce((total, meal) => ({
    caloriesKcal: total.caloriesKcal + meal.estimatedNutrition.caloriesKcal,
    proteinGrams: total.proteinGrams + meal.estimatedNutrition.proteinGrams,
    carbohydrateGrams: total.carbohydrateGrams + meal.estimatedNutrition.carbohydrateGrams,
    fatGrams: total.fatGrams + meal.estimatedNutrition.fatGrams,
  }), { caloriesKcal: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0 })
}

type SwapFeedback = { kind: 'error' | 'info' | 'success'; message: string }

interface PlanContentProps { mealPlan: MealPlan; onMealPhoto(): void; canSwap: boolean; onPlanUpdated(mealPlan: MealPlan): void }

function PlanContent({ mealPlan, onMealPhoto, canSwap, onPlanUpdated }: PlanContentProps) {
  const plan = mealPlan.content
  // Read the clock once per plan view so the highlighted meal stays put while the page is open.
  const [now] = useState(() => new Date())
  const ordered = useMemo(() => [...plan.days].sort((a, b) => a.day - b.day), [plan.days])
  const todayNumber = useMemo(() => todayPlanDay(ordered, mealPlan.createdAt, now), [ordered, mealPlan.createdAt, now])
  const [selectedDayNumber, setSelectedDayNumber] = useState(todayNumber ?? ordered[0]?.day ?? 1)
  const selectedDay = plan.days.find((day) => day.day === selectedDayNumber) ?? ordered[0]
  const isToday = selectedDay !== undefined && selectedDay.day === todayNumber
  const next = isToday ? nextMealIndex(selectedDay.meals, now) : null
  const tomorrow = isToday ? ordered[(ordered.indexOf(selectedDay) + 1) % ordered.length] : undefined
  const shoppingItems = plan.shoppingList.reduce((total, group) => total + group.items.length, 0)
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
    <DayTabs days={ordered} selectedDay={selectedDay?.day ?? selectedDayNumber} todayDay={todayNumber} onSelect={setSelectedDayNumber}/>

    {selectedDay && <div className="mp-day" id="mp-day-panel" role="tabpanel" aria-labelledby={`mp-day-tab-${selectedDay.day}`}>
      <DaySummary key={selectedDay.day} day={selectedDay} isToday={isToday}/>

      {typeof next === 'number' && <NextMeal meal={selectedDay.meals[next]} onMealPhoto={onMealPhoto}/>}
      {next === 'done' && tomorrow?.meals[0] && <button className="mp-tomorrow" type="button" onClick={() => setSelectedDayNumber(tomorrow.day)}>
        <span>Refeições de hoje concluídas. Amanhã começa com</span>
        <strong>{tomorrow.meals[0].name}{tomorrow.meals[0].suggestedTime && ` · ${tomorrow.meals[0].suggestedTime}`}</strong>
        <svg className="mp-tomorrow__arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>
      </button>}

      {/* Keyed by day so the timeline builds up again whenever another day is picked. */}
      <ol className="mp-meals" aria-label={`Refeições de ${selectedDay.label}`} key={`meals-${selectedDay.day}`}>
        {selectedDay.meals.map((meal, index) => {
          const key = `${selectedDay.day}-${index}`
          const past = next === 'done' || (typeof next === 'number' && index < next)
          // Keyed by position so an open meal stays open when a swap replaces it.
          return <MealPresentation meal={meal} order={index} next={index === next} past={past} key={key} swapping={swappingKey === key} swapDisabled={swappingKey !== null && swappingKey !== key} feedback={swapFeedback[key]} onSwap={() => void requestSwap(selectedDay.day, index)}/>
        })}
      </ol>
    </div>}

    <div className="mp-more">
      <details className="mp-disclosure">
        <summary><span>Lista de compras</span><small>{shoppingItems} {shoppingItems === 1 ? 'item' : 'itens'} · {currency.format(plan.estimatedWeeklyCost)}</small></summary>
        <div className="mp-shopping">{plan.shoppingList.map((group, groupIndex) => <section key={`${group.category}-${groupIndex}`} style={{ '--i': groupIndex } as CSSProperties}><h3>{group.category}</h3><ul>{group.items.map((item, index) => <li key={`${item.name}-${index}`}><span>{item.name}</span><strong>{number.format(item.quantity)}&nbsp;{item.unit}</strong></li>)}</ul></section>)}</div>
      </details>
      <details className="mp-disclosure">
        <summary><span>Sobre este plano</span><small>Metas diárias e custo</small></summary>
        <div className="mp-about">
          <h3>{plan.title}</h3>
          <p>{plan.summary}</p>
          <p className="mp-about__label">Metas diárias estimadas</p>
          <NutritionValues nutrition={plan.dailyTargets}/>
          <p className="mp-about__cost">Custo semanal estimado: <strong>{currency.format(plan.estimatedWeeklyCost)}</strong></p>
        </div>
      </details>
      {plan.notes.length > 0 && <details className="mp-disclosure">
        <summary><span>Observações</span><small>{plan.notes.length}</small></summary>
        <ul className="mp-notes">{plan.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
      </details>}
    </div>

    <aside className="mp-safety" aria-label="Avisos importantes">
      <ul>{plan.safetyNotices.map((notice, index) => <li key={index}>{notice}</li>)}</ul>
    </aside>
  </div>
}

function DayTabs({ days, selectedDay, todayDay, onSelect }: { days: MealPlanDay[]; selectedDay: number; todayDay?: number; onSelect(day: number): void }) {
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = days.findIndex((day) => day.day === selectedDay)
    const target = event.key === 'ArrowRight' ? current + 1 : event.key === 'ArrowLeft' ? current - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? days.length - 1 : null
    if (target === null) return
    event.preventDefault()
    const index = (target + days.length) % days.length
    onSelect(days[index].day)
    tabs.current[index]?.focus()
  }

  const selectedIndex = Math.max(0, days.findIndex((day) => day.day === selectedDay))
  return <div className="mp-day-tabs" role="tablist" aria-label="Dias do plano alimentar" onKeyDown={handleKeyDown}>
    <span className="mp-day-tabs__indicator" aria-hidden="true" style={{ '--index': selectedIndex } as CSSProperties}/>
    {days.map((day, index) => {
      const selected = day.day === selectedDay, today = day.day === todayDay
      return <button
        key={day.day}
        ref={(element) => { tabs.current[index] = element }}
        id={`mp-day-tab-${day.day}`}
        className={today ? 'mp-day-tab mp-day-tab--today' : 'mp-day-tab'}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-controls="mp-day-panel"
        aria-label={today ? `${day.label} (hoje)` : day.label}
        tabIndex={selected ? 0 : -1}
        onClick={() => onSelect(day.day)}
      >{shortDayLabel(day)}</button>
    })}
  </div>
}

function FoodList({ meal }: { meal: Meal }) {
  return <ul className="mp-foods">{meal.foods.map((food, foodIndex) => <li key={`${food.name}-${foodIndex}`}><span>{food.name}</span><strong>{number.format(food.quantity)}&nbsp;{food.unit}</strong></li>)}</ul>
}

function DaySummary({ day, isToday }: { day: MealPlanDay; isToday: boolean }) {
  const totals = dayNutrition(day)
  return <SpotlightCard as="section" className="mp-day__summary" aria-labelledby="mp-day-title" {...spotlight}>
    <div className="mp-day__heading">
      <h2 id="mp-day-title">{isToday ? `Hoje, ${day.label.toLocaleLowerCase('pt-BR')}` : day.label}</h2>
      <span>{day.meals.length} {day.meals.length === 1 ? 'refeição' : 'refeições'}</span>
    </div>
    <dl className="mp-day__stats">
      <div><dt>Calorias</dt><dd><CountUp value={totals.caloriesKcal} format={formatWhole}/><span>kcal</span></dd></div>
      <div><dt>Custo do dia</dt><dd><CountUp value={day.estimatedDailyCost} format={formatCurrency} delay={80}/></dd></div>
      <div><dt>Proteína</dt><dd><CountUp value={totals.proteinGrams} format={formatWhole} delay={160}/><span>g</span></dd></div>
    </dl>
    <MacroBar proteinGrams={totals.proteinGrams} carbohydrateGrams={totals.carbohydrateGrams} fatGrams={totals.fatGrams}/>
  </SpotlightCard>
}

function NextMeal({ meal, onMealPhoto }: { meal: Meal; onMealPhoto(): void }) {
  return <SpotlightCard as="section" className="mp-next" aria-labelledby="mp-next-title" {...spotlight} style={{ ...spotlight.style, '--spotlight-card-surface': 'var(--green-soft)', '--spotlight-card-border': 'color-mix(in srgb, var(--brand-green-light) 70%, transparent)' } as CSSProperties}>
    <p className="mp-next__when"><span className="mp-next__pulse" aria-hidden="true"/>Próxima refeição{meal.suggestedTime && <> · <time>{meal.suggestedTime}</time></>}</p>
    <h3 id="mp-next-title">{meal.name}</h3>
    <FoodList meal={meal}/>
    <div className="mp-next__footer">
      <span>{number.format(meal.estimatedNutrition.caloriesKcal)} kcal · {number.format(meal.estimatedNutrition.proteinGrams)} g de proteína</span>
      <Button variant="secondary" onClick={onMealPhoto}>Registrar com foto</Button>
    </div>
  </SpotlightCard>
}

interface MealPresentationProps { meal: Meal; order: number; next: boolean; past: boolean; swapping: boolean; swapDisabled: boolean; feedback?: SwapFeedback; onSwap(): void }

function MealPresentation({ meal, order, next, past, swapping, swapDisabled, feedback, onSwap }: MealPresentationProps) {
  const classes = ['mp-meal', next ? 'mp-meal--next' : '', past ? 'mp-meal--past' : '', swapping ? 'mp-meal--swapping' : ''].filter(Boolean).join(' ')
  return <li className={classes} aria-busy={swapping || undefined} style={{ '--i': order } as CSSProperties}>
    <details>
      <summary>
        <span className="mp-meal__time">{meal.suggestedTime && <time>{meal.suggestedTime}</time>}</span>
        <span className="mp-meal__dot" aria-hidden="true"/>
        <span className="mp-meal__title"><strong>{meal.name}</strong><small>{meal.foods.map((food) => food.name).join(', ')}</small></span>
        <span className="mp-meal__kcal">{number.format(meal.estimatedNutrition.caloriesKcal)} kcal</span>
      </summary>
      <div className="mp-meal__body">
        <FoodList meal={meal}/>
        <p className="mp-meal__preparation">{meal.preparation}</p>
        <NutritionValues nutrition={meal.estimatedNutrition} compact/>
        <Button className="mp-meal__swap" variant="ghost" loading={swapping} loadingLabel="Trocando esta refeição" disabled={swapDisabled} aria-label={`Trocar esta refeição: ${meal.name}`} onClick={onSwap}>Trocar refeição</Button>
      </div>
    </details>
    {swapping && <p className="mp-meal__swap-status" role="status">Buscando uma alternativa equivalente…</p>}
    {feedback && (feedback.kind === 'error'
      ? <p className="mp-meal__swap-feedback mp-meal__swap-feedback--error" role="alert">{feedback.message}</p>
      : <p className={`mp-meal__swap-feedback mp-meal__swap-feedback--${feedback.kind}`} role="status">{feedback.message}</p>)}
  </li>
}
