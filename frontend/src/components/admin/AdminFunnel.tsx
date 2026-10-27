import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../services/api'
import { getAdminFunnel } from '../../services/adminService'
import type { AdminFunnel as Funnel, FunnelPeriod } from '../../types/admin'
import './AdminFunnel.css'

const periods: FunnelPeriod[] = [7, 14, 30]
const integer = new Intl.NumberFormat('pt-BR')
const shortDateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(value))
const dayLabel = (date: string) => date.slice(8, 10)
const dayTitle = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`
// The link for the Instagram bio and ads: opens the questions directly and tags the visit. comecar needs a
// value: Instagram drops a parameter without one, and the link then lands on the home page.
const instagramLink = `${window.location.origin}/?comecar=1&origem=instagram`

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 403) return 'Esta conta não possui autorização administrativa.'
  if (error instanceof ApiError && error.status === 429) return 'Muitas solicitações administrativas. Aguarde um instante.'
  return 'Não foi possível carregar o funil agora.'
}

/** Where people drop off between the preview and a subscription, for the owner. */
export function AdminFunnel() {
  const [period, setPeriod] = useState<FunnelPeriod>(14)
  const [funnel, setFunnel] = useState<Funnel | null>(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try { await navigator.clipboard.writeText(instagramLink); setCopied(true); window.setTimeout(() => setCopied(false), 2000) }
    catch { setCopied(false) }
  }

  const load = useCallback(async (days: FunnelPeriod) => {
    setLoading(true); setError(null)
    try { setFunnel((await getAdminFunnel(days)).funnel) }
    catch (requestError) { if (!(requestError instanceof ApiError && requestError.status === 401)) setError(errorMessage(requestError)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    // Loads the selected period from the admin API.
    // oxlint-disable-next-line react/set-state-in-effect
    void load(period)
  }, [load, period])

  const totals = funnel?.totals
  const stages = totals ? [
    { label: 'Viram a prévia', value: totals.previews },
    { label: 'Criaram conta', value: totals.accounts },
    { label: 'Completaram perfil', value: totals.profiles },
    { label: 'Geraram 1º plano', value: totals.firstPlans },
    { label: 'Foram ao pagamento', value: totals.checkouts, money: true },
    { label: 'Assinaram', value: totals.subscriptions, money: true },
  ] : []
  const widest = Math.max(1, ...stages.map((stage) => stage.value))
  const busiestDay = Math.max(1, ...(funnel?.days ?? []).map((day) => day.previews))

  return <section className="panel admin-funnel" aria-labelledby="admin-funnel-title" aria-busy={loading}>
    <div className="panel__header admin-funnel__header">
      <div><p className="eyebrow">Funil</p><h2 id="admin-funnel-title">Quem chega e quem fica</h2></div>
      <div className="admin-funnel__periods" role="group" aria-label="Período">
        {periods.map((days) => <button key={days} type="button" aria-pressed={period === days} disabled={loading && period === days} onClick={() => setPeriod(days)}>{days} dias</button>)}
      </div>
    </div>

    {error && <div className="notice notice--error" role="alert">{error}</div>}
    {!funnel && loading && <div className="loading"><span className="spinner" aria-label="Carregando funil"/></div>}

    {funnel && totals && <>
      <div className="admin-metrics admin-funnel__metrics" aria-label="Resumo do funil">
        <article><span>Prévias</span><strong>{integer.format(totals.previews)}</strong></article>
        <article><span>Contas novas</span><strong>{integer.format(totals.accounts)}</strong></article>
        <article><span>Foram ao pagamento</span><strong>{integer.format(totals.checkouts)}</strong></article>
        <article><span>Assinaturas</span><strong>{integer.format(totals.subscriptions)}</strong></article>
      </div>

      <div className="admin-funnel__grid">
        <div className="admin-funnel__block">
          <h3>Etapas no período</h3>
          <ol className="admin-funnel__stages">
            {stages.map((stage) => <li key={stage.label}>
              <span>{stage.label}</span>
              <span className="admin-funnel__track"><span className={stage.money ? 'admin-funnel__bar admin-funnel__bar--money' : 'admin-funnel__bar'} style={{ width: `${Math.max(stage.value ? 3 : 0, (stage.value / widest) * 100)}%` }}/></span>
              <b>{integer.format(stage.value)}</b>
            </li>)}
          </ol>
          <p className="admin-funnel__note">Prévias contam visitantes sem conta, inclusive os nossos testes. Pagamento e assinatura contam pessoas, não tentativas.{totals.previewFailures > 0 && ` ${integer.format(totals.previewFailures)} prévia(s) falharam no período.`}</p>
        </div>

        <div className="admin-funnel__block">
          <h3>Por dia</h3>
          <div className="admin-funnel__days" style={{ gridTemplateColumns: `repeat(${funnel.days.length}, minmax(0, 1fr))` }}>
            {funnel.days.map((day) => <div key={day.date} className="admin-funnel__day" title={`${dayTitle(day.date)}: ${day.previews} prévia(s), ${day.accounts} conta(s)`}>
              <b className="admin-funnel__accounts">{day.accounts > 0 ? day.accounts : ''}</b>
              <span className="admin-funnel__column" style={{ height: `${day.previews ? Math.max(6, (day.previews / busiestDay) * 100) : 2}%` }} data-empty={day.previews === 0}/>
              <small>{funnel.days.length > 14 && Number(dayLabel(day.date)) % 2 === 0 ? '' : dayLabel(day.date)}</small>
            </div>)}
          </div>
          <p className="admin-funnel__note"><span className="admin-funnel__legend admin-funnel__legend--previews">Barras</span>: prévias. <span className="admin-funnel__legend admin-funnel__legend--accounts">Números</span>: contas novas.</p>
        </div>
      </div>

      <div className="admin-funnel__block">
        <h3>De onde vieram</h3>
        <div className="admin-funnel__link">
          <code>{instagramLink}</code>
          <button className="button button--secondary" type="button" onClick={() => void copyLink()}>{copied ? 'Copiado' : 'Copiar link'}</button>
        </div>
        {funnel.sources.length === 0
          ? <p className="admin-funnel__note">Ninguém chegou por um link com origem neste período. Use o link acima na bio e nos anúncios; para outro canal, troque instagram pelo nome dele (ex.: origem=whatsapp).</p>
          : <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>Origem</th><th>Prévias</th><th>Contas</th></tr></thead>
            <tbody>{funnel.sources.map((row) => <tr key={row.source}><td>{row.source}</td><td>{integer.format(row.previews)}</td><td>{integer.format(row.accounts)}</td></tr>)}</tbody>
          </table></div>}
        <p className="admin-funnel__note">Conta só quem chegou por um link com origem, a partir de 26/10.</p>
      </div>

      <div className="admin-funnel__block">
        <h3>Últimas {funnel.latestAccounts.length} contas</h3>
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Criada</th><th>Nome</th><th>Perfil</th><th>Planos</th><th>Pagamento</th></tr></thead>
          <tbody>{funnel.latestAccounts.length === 0 ? <tr><td colSpan={5} className="empty">Nenhuma conta ainda.</td></tr> : funnel.latestAccounts.map((account) => <tr key={`${account.createdAt}-${account.name}`}>
            <td>{shortDateTime(account.createdAt)}</td>
            <td>{account.name}</td>
            <td>{account.hasProfile ? 'sim' : 'não'}</td>
            <td>{integer.format(account.mealPlans)}</td>
            <td>{account.isPremium ? 'Premium' : account.checkoutAttempts > 0 ? 'Tentou' : '—'}</td>
          </tr>)}</tbody>
        </table></div>
      </div>
    </>}
  </section>
}
