import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { DiaryNavButton } from '../components/DiaryNavButton'
import { WeightChart } from '../components/WeightChart'
import { PageHeader } from '../components/layout/PageHeader'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { FormField } from '../components/ui/FormField'
import { LoadingState } from '../components/ui/LoadingState'
import { Surface } from '../components/ui/Surface'
import { ApiError } from '../services/api'
import { createProgress, listProgress } from '../services/progressService'
import type { ProgressEntry } from '../types/progress'
import { formatDate, today } from '../utils/date'
import './ProgressPage.css'

function mergeUnique(current: ProgressEntry[], incoming: ProgressEntry[]): ProgressEntry[] {
  const map = new Map(current.map((entry) => [entry.id, entry]))
  incoming.forEach((entry) => map.set(entry.id, entry))
  return [...map.values()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.createdAt.localeCompare(a.createdAt))
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return 'Sua sessão expirou. Entre novamente para continuar.'
  if (error instanceof ApiError && error.code === 'INVALID_PROGRESS_DATA') return 'Confira o peso, a data e a observação antes de salvar.'
  if (error instanceof ApiError && error.code === 'INVALID_PROGRESS_CURSOR') return 'Não foi possível continuar o histórico. Atualize a página e tente novamente.'
  return 'Não foi possível atualizar sua evolução agora. Tente novamente.'
}

function formatWeight(value: string | number): string {
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
}

interface ProgressPageProps { notice?: string; onMealPlan(): void; onChat(): void; onDiary(): void; onProfile(): void; onLogout(): void }

export function ProgressPage({ notice, onMealPlan, onChat, onDiary, onProfile, onLogout }: ProgressPageProps) {
  const [entries, setEntries] = useState<ProgressEntry[]>([]), [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false), [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null), [success, setSuccess] = useState<string | null>(null)
  const [weight, setWeight] = useState(''), [date, setDate] = useState(today()), [note, setNote] = useState('')
  const weightInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let active = true
    void listProgress()
      .then((data) => { if (active) { setEntries(mergeUnique([], data.progressEntries)); setNextCursor(data.nextCursor) } })
      .catch((requestError: unknown) => { if (active) setError(errorMessage(requestError)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const chronological = useMemo(() => [...entries].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.createdAt.localeCompare(b.createdAt)), [entries])
  const current = chronological.at(-1)
  const variation = current && chronological.length > 1 ? Number(current.weightKg) - Number(chronological[0].weightKg) : null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true); setError(null); setSuccess(null)
    try {
      const { progressEntry } = await createProgress({ weightKg: weight, recordedAt: date, note: note.trim() || null })
      setEntries((value) => mergeUnique(value, [progressEntry]))
      setWeight(''); setNote(''); setDate(today()); setSuccess('Registro adicionado com sucesso.')
    } catch (requestError) { setError(errorMessage(requestError)) }
    finally { setSubmitting(false) }
  }

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true); setError(null)
    try {
      const data = await listProgress(nextCursor)
      setEntries((value) => mergeUnique(value, data.progressEntries)); setNextCursor(data.nextCursor)
    } catch (requestError) { setError(errorMessage(requestError)) }
    finally { setLoadingMore(false) }
  }

  function focusWeightForm() {
    weightInputRef.current?.focus()
  }

  return <div className="app-shell"><header className="topbar"><div className="topbar__content"><div className="brand"><BrandLogo/></div><nav className="topbar__actions" aria-label="Navegação principal"><button className="nav-button" type="button" onClick={onMealPlan}>Plano alimentar</button><button className="nav-button" type="button" onClick={onChat}>Assistente</button><DiaryNavButton onClick={onDiary}/><button className="nav-button" type="button" onClick={onProfile}>Perfil</button><button className="nav-button nav-button--active" type="button" aria-current="page">Evolução</button><button className="logout-button" type="button" onClick={onLogout}>Sair</button></nav></div></header>
    <main className="page progress-page">
      <PageHeader eyebrow="Seu histórico" title="Evolução" description="Acompanhe seus registros de peso ao longo do tempo, com uma visão simples e responsável da sua trajetória."/>

      <div className="progress-feedback" aria-live="polite">
        {error && <Alert variant="error" title="Não foi possível atualizar sua evolução">{error}</Alert>}
        {(success || notice) && <Alert variant="success" title="Registro atualizado">{success || notice}</Alert>}
      </div>

      <Surface as="section" className="progress-summary" aria-label="Resumo da evolução">
        <div className="progress-summary__intro"><p>Visão atual</p><h2>Seus registros, com clareza</h2></div>
        <dl>
          <div><dt>Peso atual</dt><dd>{current ? <><strong>{formatWeight(current.weightKg)}</strong><span>kg</span></> : <strong>—</strong>}</dd></div>
          <div><dt>Variação no período carregado</dt><dd>{variation === null ? <strong>—</strong> : <><strong>{variation > 0 ? '+' : ''}{formatWeight(variation)}</strong><span>kg</span></>}</dd></div>
          <div><dt>Registros carregados</dt><dd><strong>{entries.length}</strong>{nextCursor && <Badge>há mais</Badge>}</dd></div>
        </dl>
        <p className="progress-summary__note">A variação é informativa e não classifica ganho ou perda de peso.</p>
      </Surface>

      <div className="progress-layout">
        <div className="progress-content">
          <Surface as="section" className="progress-chart-section" aria-labelledby="progress-chart-title">
            <div className="progress-section-heading"><div><p>Trajetória</p><h2 id="progress-chart-title">Evolução do peso</h2></div><Badge>{entries.length} {entries.length === 1 ? 'registro' : 'registros'}</Badge></div>
            {loading ? <LoadingState label="Carregando sua evolução" description="Buscando seus registros mais recentes."/> : <WeightChart entries={entries}/>}
          </Surface>

          <Surface as="section" className="progress-history" aria-labelledby="progress-history-title">
            <div className="progress-section-heading"><div><p>Registros</p><h2 id="progress-history-title">Histórico</h2></div><span>Mais recente primeiro</span></div>
            {loading ? <LoadingState label="Carregando histórico"/> : entries.length === 0 ? <div className="progress-empty"><span aria-hidden="true">↗</span><h3>Ainda não há registros de evolução.</h3><p>Registre seu peso para acompanhar mudanças ao longo do tempo.</p><Button variant="secondary" onClick={focusWeightForm}>Registrar primeiro peso</Button></div> : <ol className="progress-history__list">{entries.map((entry) => <li key={entry.id}>
              <div><time dateTime={entry.recordedAt}>{formatDate(entry.recordedAt)}</time><strong>{formatWeight(entry.weightKg)} <small>kg</small></strong></div>
              <p className={entry.note ? '' : 'progress-history__empty-note'}>{entry.note || 'Sem observação'}</p>
            </li>)}</ol>}
            {nextCursor && <div className="progress-load-more"><Button variant="secondary" loading={loadingMore} loadingLabel="Carregando mais registros" onClick={() => void handleLoadMore()}>Carregar mais</Button></div>}
          </Surface>
        </div>

        <Surface as="section" level="soft" className="progress-form-card" aria-labelledby="progress-form-title">
          <div className="progress-form-card__heading"><span aria-hidden="true">＋</span><div><p>Novo registro</p><h2 id="progress-form-title">Registrar peso</h2></div></div>
          <p className="progress-form-card__description">Adicione uma medição real para manter seu histórico atualizado.</p>
          <form className="progress-form" onSubmit={(event) => void handleSubmit(event)}>
            <FormField id="progress-weight" label="Peso (kg)" hint="Use até duas casas decimais." required>
              {(controlProps) => <input {...controlProps} ref={weightInputRef} type="number" inputMode="decimal" min="0.01" max="9999.99" step="0.01" placeholder="Ex.: 72,5" value={weight} onChange={(event) => setWeight(event.target.value)}/>}
            </FormField>
            <FormField id="progress-date" label="Data" required>
              {(controlProps) => <input {...controlProps} type="date" max={today()} value={date} onChange={(event) => setDate(event.target.value)}/>}
            </FormField>
            <FormField id="progress-note" label="Observação" hint={`${note.length}/1000 · opcional`}>
              {(controlProps) => <textarea {...controlProps} maxLength={1000} placeholder="Como foi sua semana?" value={note} onChange={(event) => setNote(event.target.value)}/>}
            </FormField>
            <Button type="submit" fullWidth loading={submitting} loadingLabel="Salvando registro">Salvar registro</Button>
          </form>
        </Surface>
      </div>
    </main>
  </div>
}
