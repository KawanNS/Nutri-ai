import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { WeightChart } from '../components/WeightChart'
import { ApiError } from '../services/api'
import { createProgress, listProgress } from '../services/progressService'
import type { ProgressEntry } from '../types/progress'
import { formatDate, today } from '../utils/date'
function mergeUnique(current: ProgressEntry[], incoming: ProgressEntry[]): ProgressEntry[] {
  const map = new Map(current.map((entry) => [entry.id, entry])); incoming.forEach((entry) => map.set(entry.id, entry))
  return [...map.values()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.createdAt.localeCompare(a.createdAt))
}
function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return 'Sua sessão não foi encontrada ou expirou. Faça login quando a autenticação estiver disponível.'
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
}
export function ProgressPage() {
  const [entries, setEntries] = useState<ProgressEntry[]>([]), [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false), [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null), [success, setSuccess] = useState<string | null>(null)
  const [weight, setWeight] = useState(''), [date, setDate] = useState(today()), [note, setNote] = useState('')
  useEffect(() => {
    let active = true
    void listProgress()
      .then((data) => { if (active) { setEntries(mergeUnique([], data.progressEntries)); setNextCursor(data.nextCursor) } })
      .catch((requestError: unknown) => { if (active) setError(errorMessage(requestError)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const chronological = useMemo(() => [...entries].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.createdAt.localeCompare(b.createdAt)), [entries])
  const current = chronological.at(-1), variation = current && chronological.length > 1 ? Number(current.weightKg) - Number(chronological[0].weightKg) : null
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError(null); setSuccess(null)
    try { const { progressEntry } = await createProgress({ weightKg: weight, recordedAt: date, note: note.trim() || null }); setEntries((value) => mergeUnique(value, [progressEntry])); setWeight(''); setNote(''); setDate(today()); setSuccess('Registro adicionado com sucesso.') }
    catch (requestError) { setError(errorMessage(requestError)) } finally { setSubmitting(false) }
  }
  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true); setError(null)
    try { const data = await listProgress(nextCursor); setEntries((value) => mergeUnique(value, data.progressEntries)); setNextCursor(data.nextCursor) }
    catch (requestError) { setError(errorMessage(requestError)) } finally { setLoadingMore(false) }
  }
  return <div className="app-shell"><header className="topbar"><div className="topbar__content"><div className="brand"><span className="brand__mark" aria-hidden="true">N</span><span>Nutri-AI</span></div><span className="muted">Seu progresso</span></div></header>
    <main className="page"><div className="page-heading"><div><p className="eyebrow">Histórico / Evolução</p><h1>Seu caminho, em números.</h1><p>Acompanhe seu peso ao longo do tempo e reconheça cada passo da sua evolução.</p></div></div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}{success && <div className="notice notice--success" role="status">{success}</div>}
      <section className="summary-grid" aria-label="Resumo do progresso"><article className="summary-card"><span className="summary-card__label">Peso atual</span><span className="summary-card__value">{current ? <>{Number(current.weightKg).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} <small>kg</small></> : '—'}</span></article><article className="summary-card"><span className="summary-card__label">Variação no período carregado</span><span className={`summary-card__value ${variation !== null && variation <= 0 ? 'variation--down' : 'variation--up'}`}>{variation === null ? '—' : <>{variation > 0 ? '+' : ''}{variation.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} <small>kg</small></>}</span></article></section>
      <div className="content-grid"><div><section className="panel"><div className="panel__header"><div><h2>Evolução do peso</h2><p className="panel__subtitle">Registros atualmente carregados</p></div></div>{loading ? <div className="loading"><span className="spinner" aria-label="Carregando gráfico"/></div> : <WeightChart entries={entries}/>}</section>
        <section className="panel history"><div className="panel__header"><div><h2>Histórico</h2><p className="panel__subtitle">Do registro mais recente ao mais antigo</p></div></div>{loading ? <div className="loading"><span className="spinner" aria-label="Carregando histórico"/></div> : entries.length === 0 ? <div className="empty">Nenhum registro ainda. Adicione seu primeiro peso ao lado.</div> : <ul className="history-list">{entries.map((entry) => <li className="history-item" key={entry.id}><time className="history-item__date" dateTime={entry.recordedAt}>{formatDate(entry.recordedAt)}</time><span className="history-item__weight">{Number(entry.weightKg).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kg</span><p className={`history-item__note ${entry.note ? '' : 'history-item__note--empty'}`}>{entry.note || 'Sem observação'}</p></li>)}</ul>}{nextCursor && <div className="load-more"><button className="button button--secondary" type="button" disabled={loadingMore} onClick={() => void handleLoadMore()}>{loadingMore ? 'Carregando…' : 'Carregar mais'}</button></div>}</section></div>
        <section className="panel panel--form"><div className="panel__header"><div><p className="eyebrow">Novo registro</p><h2>Como você está hoje?</h2></div></div><form className="form" onSubmit={(event) => void handleSubmit(event)}><div className="field"><label htmlFor="weight">Peso (kg)</label><input id="weight" type="number" inputMode="decimal" min="0.01" max="9999.99" step="0.01" placeholder="Ex.: 72,5" required value={weight} onChange={(event) => setWeight(event.target.value)}/></div><div className="field"><label htmlFor="date">Data</label><input id="date" type="date" max={today()} required value={date} onChange={(event) => setDate(event.target.value)}/></div><div className="field"><label htmlFor="note">Observação <span className="muted">(opcional)</span></label><textarea id="note" maxLength={1000} placeholder="Como foi sua semana?" value={note} onChange={(event) => setNote(event.target.value)}/><span className="field__hint">{note.length}/1000</span></div><button className="button button--primary" type="submit" disabled={submitting}>{submitting ? 'Salvando…' : 'Salvar registro'}</button></form></section>
      </div></main></div>
}
