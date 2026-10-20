import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppTopbar } from '../components/layout/AppTopbar'
import { DiaryIcon } from '../components/DiaryNavButton'
import { PageHeader } from '../components/layout/PageHeader'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { LoadingState } from '../components/ui/LoadingState'
import { listDiaryFoodLogs } from '../services/diaryService'
import type { DiaryFoodLog } from '../types/diary'
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
  const requestSequence = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current
    setLoading(true)
    setError(null)
    try {
      const result = await listDiaryFoodLogs(date)
      if (requestId === requestSequence.current) setFoodLogs(result.foodLogs)
    } catch {
      if (requestId === requestSequence.current) {
        setFoodLogs([])
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

  const totals = useMemo(() => ({
    calories: completeTotal(foodLogs, 'estimatedCaloriesKcal'),
    protein: completeTotal(foodLogs, 'estimatedProteinGrams'),
    carbohydrates: completeTotal(foodLogs, 'estimatedCarbohydrateGrams'),
    fat: completeTotal(foodLogs, 'estimatedFatGrams'),
  }), [foodLogs])

  return <div className="app-shell">
    <AppTopbar active="diary" onMealPlan={onMealPlan} onChat={onChat} onProgress={onProgress}/>
    <main className="page page--narrow diary-page">
      <PageHeader title="Diário alimentar" actions={<Button onClick={onMealPhoto}>Registrar refeição</Button>}/>

      <nav className="diary-day-picker" aria-label="Selecionar dia do diário">
        <Button variant="ghost" aria-label="Ver dia anterior" onClick={() => setDate((current) => addDays(current, -1))}><Chevron direction="left"/></Button>
        <strong aria-live="polite">{dayLabel(date)}</strong>
        <Button variant="ghost" aria-label="Ver próximo dia" disabled={date >= today()} onClick={() => setDate((current) => addDays(current, 1))}><Chevron direction="right"/></Button>
      </nav>

      {error && <Alert variant="error" title="Não foi possível abrir o diário"><span>{error}</span><Button className="diary-retry" variant="ghost" onClick={() => setReloadKey((value) => value + 1)}>Tentar novamente</Button></Alert>}
      {loading ? <LoadingState className="diary-loading" label="Carregando seu diário" description="Buscando as refeições registradas neste dia."/> : !error && foodLogs.length === 0 ? <section className="diary-empty" aria-labelledby="diary-empty-title"><span className="diary-empty__icon"><DiaryIcon/></span><h2 id="diary-empty-title">Nenhuma refeição registrada {date === today() ? 'hoje' : 'neste dia'}.</h2><p>Tire uma foto do prato na próxima refeição e ela aparece aqui.</p></section> : !error && <>
        <section className="diary-summary" aria-labelledby="diary-summary-title">
          <div className="ui-section-heading"><h2 id="diary-summary-title">Total do dia</h2><span>{foodLogs.length} {foodLogs.length === 1 ? 'refeição' : 'refeições'}</span></div>
          <dl className="ui-stat-row diary-summary__values">
            <SummaryValue label="Calorias" value={totals.calories} unit="kcal"/>
            <SummaryValue label="Proteínas" value={totals.protein} unit="g"/>
            <SummaryValue label="Carboidratos" value={totals.carbohydrates} unit="g"/>
            <SummaryValue label="Gorduras" value={totals.fat} unit="g"/>
          </dl>
          {Object.values(totals).some((value) => value === null) && <p className="diary-summary__note">“—” indica que a estimativa não está completa em todos os registros do dia.</p>}
        </section>

        <section className="diary-entries" aria-labelledby="diary-entries-title">
          <div className="ui-section-heading"><h2 id="diary-entries-title">Refeições</h2><span>Mais antigas primeiro</span></div>
          <ol>{foodLogs.map((foodLog) => <DiaryEntry key={foodLog.id} foodLog={foodLog}/>)}</ol>
        </section>
      </>}
    </main>
  </div>
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return <svg className="diary-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d={direction === 'left' ? 'm14.5 6-6 6 6 6' : 'm9.5 6 6 6-6 6'}/></svg>
}

function SummaryValue({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return <div><dt>{label}</dt><dd>{value === null ? <strong aria-label={`${label}: estimativa indisponível`}>—</strong> : <>{number.format(value)}<span>{unit}</span></>}</dd></div>
}

function DiaryEntry({ foodLog }: { foodLog: DiaryFoodLog }) {
  const nutrients: Array<[string, number | null, string]> = [
    ['Proteínas', foodLog.estimatedProteinGrams, 'g'],
    ['Carboidratos', foodLog.estimatedCarbohydrateGrams, 'g'],
    ['Gorduras', foodLog.estimatedFatGrams, 'g'],
  ]
  const time = timeLabel(foodLog.consumedAt)
  return <li className="diary-entry">
    <header><h3><time dateTime={foodLog.consumedAt}>Refeição — {time}</time></h3><span>{foodLog.estimatedCaloriesKcal === null ? '— kcal' : `${number.format(foodLog.estimatedCaloriesKcal)} kcal`}</span></header>
    <ul className="diary-entry__foods">{foodLog.items.map((item) => <li key={item.id}><span>{item.name}</span><small>{item.portionDescription}</small></li>)}</ul>
    <dl className="diary-entry__nutrition">{nutrients.map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{value === null ? '—' : `${number.format(value)} ${unit}`}</dd></div>)}</dl>
    {foodLog.notes && <p className="diary-entry__notes">{foodLog.notes}</p>}
  </li>
}
