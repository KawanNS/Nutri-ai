import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ApiError } from '../services/api'
import { listAdminAudit, listAdminCosts, listAdminModels, listAdminProviders, listAdminRoutes, listAdminUsage, updateAdminRoute, type AdminFilters } from '../services/adminService'
import type { AdminModel, AdminProvider, AdminRoute, AuditItem, CostResponse, UsageResponse } from '../types/admin'

interface Props { onApp(): void; onLogout(): void }
interface DashboardData { routes: AdminRoute[]; providers: AdminProvider[]; models: AdminModel[]; usage: UsageResponse; costs: CostResponse['costs']; audit: AuditItem[] }
const integer = new Intl.NumberFormat('pt-BR')
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function isoBoundary(value: string, end = false): string | undefined { return value ? `${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z` : undefined }
function dateTime(value: string) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) }
function costLabel(amountMicros: string, currency: string) {
  const amount = Number(amountMicros) / 1_000_000
  return Number.isFinite(amount) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount) : 'Indisponível'
}
function errorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return 'Não foi possível carregar o painel agora.'
  if (error.status === 403) return 'Esta conta não possui autorização administrativa.'
  if (error.status === 429) return 'Muitas solicitações administrativas. Aguarde um instante.'
  if (error.code === 'AI_ROUTE_VERSION_CONFLICT') return 'A rota foi alterada em outra sessão. Os dados foram recarregados.'
  return 'O painel administrativo está temporariamente indisponível.'
}

export function AdminRouterPage({ onApp, onLogout }: Props) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true), [savingTask, setSavingTask] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null)
  const [filters, setFilters] = useState({ task: '', provider: '', status: '', from: '', to: '' })
  const requestFilters = useMemo<AdminFilters>(() => ({ task: filters.task || undefined, provider: filters.provider || undefined, status: filters.status || undefined, from: isoBoundary(filters.from), to: isoBoundary(filters.to, true) }), [filters])

  const load = useCallback(async (nextFilters: AdminFilters = requestFilters) => {
    setLoading(true); setError(null)
    try {
      const [routes, providers, models, usage, costs, audit] = await Promise.all([
        listAdminRoutes(), listAdminProviders(), listAdminModels(), listAdminUsage(nextFilters), listAdminCosts(nextFilters),
        listAdminAudit({ task: nextFilters.task, from: nextFilters.from, to: nextFilters.to }),
      ])
      setData({ routes: routes.routes, providers: providers.providers, models: models.models, usage, costs: costs.costs, audit: audit.items })
    } catch (requestError) { if (!(requestError instanceof ApiError && requestError.status === 401)) setError(errorMessage(requestError)) }
    finally { setLoading(false) }
  }, [requestFilters])

  useEffect(() => {
    // Initial loading synchronizes this authenticated view with the admin API.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])
  function submitFilters(event: FormEvent) { event.preventDefault(); void load(requestFilters) }
  async function saveRoute(route: AdminRoute, provider: string, model: string, enabled: boolean) {
    setSavingTask(route.task); setError(null); setNotice(null)
    try {
      const response = await updateAdminRoute(route.task, { provider: provider as 'GEMINI', model, enabled, expectedVersion: route.version })
      setData((current) => current ? { ...current, routes: current.routes.map((item) => item.task === route.task ? response.route : item) } : current)
      setNotice('Configuração salva e registrada na auditoria.')
    } catch (requestError) {
      setError(errorMessage(requestError))
      if (requestError instanceof ApiError && requestError.status === 409) await load(requestFilters)
    } finally { setSavingTask(null) }
  }

  return <div className="app-shell admin-shell"><header className="topbar"><div className="topbar__content"><div className="brand"><span className="brand__mark" aria-hidden="true">N</span><span>Nutri-AI</span><span className="admin-badge">Admin</span></div><nav className="topbar__actions" aria-label="Navegação administrativa"><button className="nav-button" type="button" onClick={onApp}>Ir para o app</button><button className="logout-button" type="button" onClick={onLogout}>Sair</button></nav></div></header>
    <main className="page admin-page"><div className="page-heading"><div><p className="eyebrow">AI Router</p><h1>Operação da inteligência</h1><p>Rotas, saúde e uso da IA do Nutri-AI, sem expor credenciais ou conteúdo dos usuários.</p></div><button className="button button--secondary" type="button" disabled={loading} onClick={() => void load()}>{loading ? 'Atualizando…' : 'Atualizar dados'}</button></div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}{notice && <div className="notice notice--success" role="status">{notice}</div>}
      {loading && !data ? <div className="panel loading"><span className="spinner" aria-label="Carregando painel administrativo"/></div> : data && <>
        <section className="admin-metrics" aria-label="Resumo de uso"><article><span>Chamadas</span><strong>{integer.format(data.usage.summary.calls)}</strong></article><article><span>Sucesso</span><strong>{integer.format(data.usage.summary.successfulCalls)}</strong></article><article><span>Falhas</span><strong>{integer.format(data.usage.summary.failedCalls)}</strong></article><article><span>Latência média</span><strong>{data.usage.summary.latency.averageMs === null ? '—' : `${decimal.format(data.usage.summary.latency.averageMs)} ms`}</strong></article><article><span>Tokens</span><strong>{data.usage.summary.usage.totalTokens === null ? '—' : integer.format(data.usage.summary.usage.totalTokens)}</strong></article></section>
        <div className="admin-layout"><section className="panel admin-routes"><div className="panel__header"><div><p className="eyebrow">Configuração</p><h2>Rotas por tarefa</h2><p className="panel__subtitle">Alterações usam versão otimista e ficam auditadas.</p></div></div>{data.routes.length === 0 ? <div className="empty">Nenhuma tarefa de IA disponível.</div> : data.routes.map((route) => <RouteEditor key={`${route.task}-${route.version}`} route={route} providers={data.providers} models={data.models} saving={savingTask === route.task} onSave={saveRoute}/>)}</section>
          <section className="panel"><div className="panel__header"><div><p className="eyebrow">Providers</p><h2>Estado operacional</h2></div></div><div className="provider-list">{data.providers.map((provider) => <article key={provider.provider}><div><strong>{provider.displayName}</strong><span>{provider.allowedModels.join(', ') || 'Nenhum modelo liberado'}</span></div><span className={`status-pill status-pill--${provider.status.toLowerCase()}`}>{provider.status === 'ACTIVE' ? 'Ativo' : provider.status === 'NOT_CONFIGURED' ? 'Não configurado' : 'Indisponível'}</span></article>)}</div></section></div>
        <section className="panel admin-filter-panel"><div className="panel__header"><div><p className="eyebrow">Observabilidade</p><h2>Uso e custos estimados</h2></div></div><form className="admin-filters" onSubmit={submitFilters}><label>Tarefa<select value={filters.task} onChange={(e) => setFilters((v) => ({ ...v, task: e.target.value }))}><option value="">Todas</option>{data.routes.map((route) => <option key={route.task} value={route.task}>{route.task}</option>)}</select></label><label>Provider<select value={filters.provider} onChange={(e) => setFilters((v) => ({ ...v, provider: e.target.value }))}><option value="">Todos</option>{data.providers.map((provider) => <option key={provider.provider} value={provider.provider}>{provider.displayName}</option>)}</select></label><label>Status<select value={filters.status} onChange={(e) => setFilters((v) => ({ ...v, status: e.target.value }))}><option value="">Todos</option><option value="SUCCESS">Sucesso</option><option value="FAILURE">Falha</option></select></label><label>De<input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilters((v) => ({ ...v, from: e.target.value }))}/></label><label>Até<input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilters((v) => ({ ...v, to: e.target.value }))}/></label><button className="button button--secondary" type="submit" disabled={loading}>Aplicar filtros</button></form>
          <div className="cost-strip"><span><strong>{integer.format(data.costs.callsWithKnownCost)}</strong> chamadas com custo estimado</span><span><strong>{integer.format(data.costs.callsWithUnknownCost)}</strong> sem preço cadastrado</span>{data.costs.totals.map((total) => <span key={total.currency}><strong>{costLabel(total.amountMicros, total.currency)}</strong> estimados</span>)}</div>
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Quando</th><th>Tarefa</th><th>Rota</th><th>Resultado</th><th>Latência</th><th>Tokens</th></tr></thead><tbody>{data.usage.items.length === 0 ? <tr><td colSpan={6} className="empty">Nenhuma chamada encontrada para estes filtros.</td></tr> : data.usage.items.map((item, index) => <tr key={`${item.startedAt}-${index}`}><td>{dateTime(item.startedAt)}</td><td>{item.task ?? 'Não identificada'}</td><td>{item.provider && item.model ? `${item.provider} / ${item.model}` : 'Indisponível'}</td><td><span className={`status-pill ${item.success ? 'status-pill--active' : 'status-pill--unavailable'}`}>{item.success ? 'Sucesso' : item.errorCategory ?? 'Falha'}</span></td><td>{integer.format(item.durationMs)} ms</td><td>{item.usage.totalTokens === null ? '—' : integer.format(item.usage.totalTokens)}</td></tr>)}</tbody></table></div></section>
        <section className="panel admin-audit"><div className="panel__header"><div><p className="eyebrow">Auditoria</p><h2>Alterações recentes</h2></div></div>{data.audit.length === 0 ? <div className="empty">Nenhuma alteração de rota registrada.</div> : <ol>{data.audit.map((item, index) => <li key={`${item.changedAt}-${index}`}><time dateTime={item.changedAt}>{dateTime(item.changedAt)}</time><div><strong>{item.task}</strong><p>{item.previousRoute.provider} / {item.previousRoute.model} → {item.currentRoute.provider} / {item.currentRoute.model}</p></div><span>v{item.currentRoute.version}</span></li>)}</ol>}</section>
      </>}
    </main></div>
}

function RouteEditor({ route, providers, models, saving, onSave }: { route: AdminRoute; providers: AdminProvider[]; models: AdminModel[]; saving: boolean; onSave(route: AdminRoute, provider: string, model: string, enabled: boolean): Promise<void> }) {
  const [provider, setProvider] = useState(route.provider), [model, setModel] = useState(route.model), [enabled, setEnabled] = useState(route.enabled)
  const allowed = models.filter((item) => item.provider === provider && item.enabled)
  return <article className="route-editor"><div className="route-editor__title"><div><strong>{route.task}</strong><span>{route.source === 'DEFAULT' ? 'Configuração padrão' : `Persistida · versão ${route.version}`}</span></div><label className="switch"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}/><span>Ativa</span></label></div><div className="route-editor__fields"><label>Provider<select value={provider} onChange={(e) => { const value = e.target.value as 'GEMINI'; setProvider(value); setModel(models.find((item) => item.provider === value && item.enabled)?.model ?? '') }}>{providers.filter((item) => item.operational).map((item) => <option key={item.provider} value={item.provider}>{item.displayName}</option>)}</select></label><label>Modelo<select value={model} onChange={(e) => setModel(e.target.value)}>{allowed.map((item) => <option key={item.model} value={item.model}>{item.model}</option>)}</select></label><button className="button button--primary" type="button" disabled={saving || !model || (provider === route.provider && model === route.model && enabled === route.enabled)} onClick={() => void onSave(route, provider, model, enabled)}>{saving ? 'Salvando…' : 'Salvar rota'}</button></div></article>
}
