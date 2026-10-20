import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppTopbar } from '../components/layout/AppTopbar'
import { DiaryIcon } from '../components/DiaryNavButton'
import { DiaryDayTarget, DiaryPlanMeals } from '../components/diary/DiaryPlanMeals'
import { PageHeader } from '../components/layout/PageHeader'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { LoadingState } from '../components/ui/LoadingState'
import { Surface } from '../components/ui/Surface'
import { ApiError } from '../services/api'
import { getDiaryPlanMeals, listDiaryFoodLogs, logDiaryPlanMeal } from '../services/diaryService'
import type { DiaryFoodLog, DiaryPlanDay } from '../types/diary'
import { today } from '../utils/date'
import './DiaryPage.css'

interface DiaryPageProps {
  onMealPlan(): void
  onChat(): void
  onMealPhoto(): void
  onProgress(): void
}

type NutrientKey = 'estimatedCaloriesKcal' | 'estimatedProteinGrams' | 'estimatedCarbohydrateGrams' | 'estimatedFatGrams'

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

function dayLabel(date: string): string {
  const formatted = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00.000Z`))
  return date === today() ? `Hoje, ${formatted}` : formatted
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function completeTotal(foodLogs: DiaryFoodLog[], field: NutrientKey): number | null {
  if (foodLogs.length === 0 || foodLogs.some((foodLog) => foodLog[field] === null)) return null
  return foodLogs.reduce((total, foodLog) => total + (foodLog[field] ?? 0), 0)
}

function errorMessage(): string {
  return 'Não deu para abrir o diário agora. Tente de novo.'
}

export function DiaryPage({ onMealPlan, onChat, onMealPhoto, onProgress }: DiaryPageProps) {
  const [date, setDate] = useState(today())
  const [foodLogs, setFoodLogs] = useState<DiaryFoodLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [plan, setPlan] = useState<DiaryPlanDay | null>(null)
  const [loggingIndex, setLoggingIndex] = useState<number | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const requestSequence = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current
    setLoading(true)
    setError(null)
    setPlanError(null)
    try {
      // The plan is a bonus: without one (or if it fails to load) the diary still works.
      const [result, planResult] = await Promise.all([listDiaryFoodLogs(date), getDiaryPlanMeals(date).catch(() => ({ plan: null }))])
      if (requestId === requestSequence.current) { setFoodLogs(result.foodLogs); setPlan(planResult.plan) }
    } catch {
      if (requestId === requestSequence.current) {
        setFoodLogs([])
        setPlan(null)
        setError(errorMessage())
      }
    } finally {
      if (requestId === requestSequence.current) setLoading(false)
    }
  }, [date])

  useEffect(() => {
    void reloadKey
    // Initial loading and date changes synchronize this authenticated view with persisted FoodLogs.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load, reloadKey])

  async function logPlanMeal(mealIndex: number) {
    if (!plan || loggingIndex !== null) return
    setLoggingIndex(mealIndex)
    setPlanError(null)
    try {
      await logDiaryPlanMeal({ mealPlanId: plan.mealPlanId, day: plan.day, mealIndex, date })
      setReloadKey((value) => value + 1)
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'PLAN_MEAL_ALREADY_LOGGED') setReloadKey((value) => value + 1)
      else setPlanError('Não deu para registrar agora. Tente de novo.')
    } finally {
      setLoggingIndex(null)
    }
  }

  const planSection = plan && <DiaryPlanMeals plan={plan} isToday={date === today()} loggingIndex={loggingIndex} error={planError} onLog={(mealIndex) => void logPlanMeal(mealIndex)}/>

  const totals = useMemo(() => ({
    calories: completeTotal(foodLogs, 'estimatedCaloriesKcal'),
    protein: completeTotal(foodLogs, 'estimatedProteinGrams'),
    carbohydrates: completeTotal(foodLogs, 'estimatedCarbohydrateGrams'),
    fat: completeTotal(foodLogs, 'estimatedFatGrams'),
  }), [foodLogs])

  return <div className="app-shell">
    <AppTopbar active="diary" onMealPlan={onMealPlan} onChat={onChat} onProgress={onProgress}/>
    <main className="page diary-page">
      <PageHeader eyebrow="Seus registros" title="Diário alimentar" description="O que você comeu em cada dia, com calorias e macros estimadas."/>

      <Surface as="section" className="diary-day-picker" level="soft" aria-label="Selecionar dia do diário">
        <Button variant="ghost" aria-label="Ver dia anterior" onClick={() => setDate((current) => addDays(current, -1))}>←</Button>
        <div><span>Dia selecionado</span><strong>{dayLabel(date)}</strong></div>
        <Button variant="ghost" aria-label="Ver próximo dia" disabled={date >= today()} onClick={() => setDate((current) => addDays(current, 1))}>→</Button>
      </Surface>

      {error && <Alert variant="error" title="Não foi possível abrir o diário"><span>{error}</span><Button className="diary-retry" variant="ghost" onClick={() => setReloadKey((value) => value + 1)}>Tentar novamente</Button></Alert>}
      {loading ? <Surface className="diary-loading"><LoadingState label="Carregando seu diário" description="Buscando as refeições registradas neste dia."/></Surface> : !error && foodLogs.length === 0 ? <><Surface as="section" className={plan ? 'diary-empty diary-empty--with-plan' : 'diary-empty'} level="soft" aria-labelledby="diary-empty-title"><span className="diary-empty__icon"><DiaryIcon/></span><div><h2 id="diary-empty-title">Nenhuma refeição registrada {date === today() ? 'hoje' : 'neste dia'}.</h2><p>{plan ? 'Marque abaixo o que você comeu do plano ou tire uma foto do prato.' : 'Tire uma foto do prato na próxima refeição e ela aparece aqui.'}</p></div><Button onClick={onMealPhoto}>Registrar refeição</Button></Surface>{planSection}</> : !error && <>
        <Surface as="section" className="diary-summary" aria-labelledby="diary-summary-title">
          <div className="diary-section-heading"><div><p>Resumo do dia</p><h2 id="diary-summary-title">Estimativas registradas</h2></div><Badge>{foodLogs.length} {foodLogs.length === 1 ? 'refeição' : 'refeições'}</Badge></div>
          {plan && <DiaryDayTarget calories={totals.calories} targets={plan.dailyTargets}/>}
          <dl className="diary-summary__values">
            <SummaryValue label="Calorias" value={totals.calories} unit="kcal" target={plan?.dailyTargets.caloriesKcal}/>
            <SummaryValue label="Proteínas" value={totals.protein} unit="g" target={plan?.dailyTargets.proteinGrams}/>
            <SummaryValue label="Carboidratos" value={totals.carbohydrates} unit="g" target={plan?.dailyTargets.carbohydrateGrams}/>
            <SummaryValue label="Gorduras" value={totals.fat} unit="g" target={plan?.dailyTargets.fatGrams}/>
          </dl>
          {Object.values(totals).some((value) => value === null) && <p className="diary-summary__note">“—” indica que a estimativa não está completa em todos os registros do dia.</p>}
        </Surface>

        {planSection}

        <section className="diary-entries" aria-labelledby="diary-entries-title">
          <div className="diary-section-heading"><div><p>Refeições registradas</p><h2 id="diary-entries-title">Seu dia, em ordem</h2></div><span>Mais antigas primeiro</span></div>
          <ol>{foodLogs.map((foodLog) => <DiaryEntry key={foodLog.id} foodLog={foodLog}/>)}</ol>
        </section>
      </>}
    </main>
  </div>
}

function SummaryValue({ label, value, unit, target }: { label: string; value: number | null; unit: string; target?: number }) {
  return <div><dt>{label}</dt><dd>{value === null ? <strong aria-label={`${label}: estimativa indisponível`}>—</strong> : <><strong>{number.format(value)}</strong><span>{unit}</span></>}</dd>{target !== undefined && <small>meta do plano: {number.format(target)} {unit}</small>}</div>
}

function DiaryEntry({ foodLog }: { foodLog: DiaryFoodLog }) {
  const nutrients: Array<[string, number | null, string]> = [
    ['Calorias', foodLog.estimatedCaloriesKcal, 'kcal'],
    ['Proteínas', foodLog.estimatedProteinGrams, 'g'],
    ['Carboidratos', foodLog.estimatedCarbohydrateGrams, 'g'],
    ['Gorduras', foodLog.estimatedFatGrams, 'g'],
  ]
  const time = timeLabel(foodLog.consumedAt)
  return <li><Surface as="article" className="diary-entry">
    <header><div><time dateTime={foodLog.consumedAt}>{time}</time><h3>Refeição — {time}</h3></div><Badge>{foodLog.items.length} {foodLog.items.length === 1 ? 'item' : 'itens'}</Badge></header>
    <ul className="diary-entry__foods">{foodLog.items.map((item) => <li key={item.id}><span>{item.name}</span><small>{item.portionDescription}</small></li>)}</ul>
    <dl className="diary-entry__nutrition">{nutrients.map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{value === null ? '—' : `${number.format(value)} ${unit}`}</dd></div>)}</dl>
    {foodLog.notes && <p className="diary-entry__notes"><strong>Observação:</strong> {foodLog.notes}</p>}
  </Surface></li>
}
