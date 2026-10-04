import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { DiaryIcon, DiaryNavButton } from '../components/DiaryNavButton'
import { PageHeader } from '../components/layout/PageHeader'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { LoadingState } from '../components/ui/LoadingState'
import { Surface } from '../components/ui/Surface'
import { listDiaryFoodLogs } from '../services/diaryService'
import type { DiaryFoodLog } from '../types/diary'
import { today } from '../utils/date'
import './DiaryPage.css'

interface DiaryPageProps {
  onMealPlan(): void
  onChat(): void
  onMealPhoto(): void
  onProfile(): void
  onProgress(): void
  onLogout(): void
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
  return 'Não foi possível carregar seu diário agora. Tente novamente.'
}

export function DiaryPage({ onMealPlan, onChat, onMealPhoto, onProfile, onProgress, onLogout }: DiaryPageProps) {
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
    <header className="topbar"><div className="topbar__content"><div className="brand"><BrandLogo/></div><nav className="topbar__actions" aria-label="Navegação principal"><button className="nav-button" type="button" onClick={onMealPlan}>Plano alimentar</button><button className="nav-button" type="button" onClick={onChat}>Assistente</button><DiaryNavButton active/><button className="nav-button" type="button" onClick={onProfile}>Perfil</button><button className="nav-button" type="button" onClick={onProgress}>Evolução</button><button className="logout-button" type="button" onClick={onLogout}>Sair</button></nav></div></header>
    <main className="page diary-page">
      <PageHeader eyebrow="Seus registros" title="Diário alimentar" description="Acompanhe suas refeições e veja como está sua alimentação ao longo do dia."/>

      <Surface as="section" className="diary-day-picker" level="soft" aria-label="Selecionar dia do diário">
        <Button variant="ghost" aria-label="Ver dia anterior" onClick={() => setDate((current) => addDays(current, -1))}>←</Button>
        <div><span>Dia selecionado</span><strong>{dayLabel(date)}</strong></div>
        <Button variant="ghost" aria-label="Ver próximo dia" disabled={date >= today()} onClick={() => setDate((current) => addDays(current, 1))}>→</Button>
      </Surface>

      {error && <Alert variant="error" title="Não foi possível abrir o diário"><span>{error}</span><Button className="diary-retry" variant="ghost" onClick={() => setReloadKey((value) => value + 1)}>Tentar novamente</Button></Alert>}
      {loading ? <Surface className="diary-loading"><LoadingState label="Carregando seu diário" description="Buscando as refeições registradas neste dia."/></Surface> : !error && foodLogs.length === 0 ? <Surface as="section" className="diary-empty" level="soft" aria-labelledby="diary-empty-title"><span className="diary-empty__icon"><DiaryIcon/></span><div><h2 id="diary-empty-title">Nenhuma refeição registrada {date === today() ? 'hoje' : 'neste dia'}.</h2><p>Use a Foto do Prato para registrar sua próxima refeição.</p></div><Button onClick={onMealPhoto}>Registrar refeição</Button></Surface> : !error && <>
        <Surface as="section" className="diary-summary" aria-labelledby="diary-summary-title">
          <div className="diary-section-heading"><div><p>Resumo do dia</p><h2 id="diary-summary-title">Estimativas registradas</h2></div><Badge>{foodLogs.length} {foodLogs.length === 1 ? 'refeição' : 'refeições'}</Badge></div>
          <dl className="diary-summary__values">
            <SummaryValue label="Calorias" value={totals.calories} unit="kcal"/>
            <SummaryValue label="Proteínas" value={totals.protein} unit="g"/>
            <SummaryValue label="Carboidratos" value={totals.carbohydrates} unit="g"/>
            <SummaryValue label="Gorduras" value={totals.fat} unit="g"/>
          </dl>
          {Object.values(totals).some((value) => value === null) && <p className="diary-summary__note">“—” indica que a estimativa não está completa em todos os registros do dia.</p>}
        </Surface>

        <section className="diary-entries" aria-labelledby="diary-entries-title">
          <div className="diary-section-heading"><div><p>Refeições registradas</p><h2 id="diary-entries-title">Seu dia, em ordem</h2></div><span>Mais antigas primeiro</span></div>
          <ol>{foodLogs.map((foodLog) => <DiaryEntry key={foodLog.id} foodLog={foodLog}/>)}</ol>
        </section>
      </>}
    </main>
  </div>
}

function SummaryValue({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return <div><dt>{label}</dt><dd>{value === null ? <strong aria-label={`${label}: estimativa indisponível`}>—</strong> : <><strong>{number.format(value)}</strong><span>{unit}</span></>}</dd></div>
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
