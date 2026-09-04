import { useState } from 'react'
import { ApiError } from '../services/api'
import { startCheckout } from '../services/billingService'
import type { SubscriptionPlan } from '../types/subscription'

const plans: Array<{ code: SubscriptionPlan; name: string; price: string; period: string; equivalent: string }> = [
  { code: 'MONTHLY', name: 'Nutri-AI Mensal', price: 'R$ 19,90', period: '/ mês', equivalent: 'Cobrança mensal' },
  { code: 'QUARTERLY', name: 'Nutri-AI Trimestral', price: 'R$ 49,90', period: '/ 3 meses', equivalent: 'Equivale a ~R$ 16,63/mês' },
  { code: 'ANNUAL', name: 'Nutri-AI Anual', price: 'R$ 159,90', period: '/ ano', equivalent: 'Equivale a ~R$ 13,33/mês' },
]

export function Paywall() {
  const [selected, setSelected] = useState<SubscriptionPlan | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function choose(plan: SubscriptionPlan) {
    setSelected(plan); setError(null)
    try {
      const { checkoutUrl } = await startCheckout(plan)
      window.location.assign(checkoutUrl)
    } catch (requestError) {
      setError(requestError instanceof ApiError && requestError.code === 'CHECKOUT_CORRELATION_NOT_VERIFIED'
        ? 'O checkout seguro está em configuração. Tente novamente em breve.'
        : 'Não foi possível iniciar o checkout agora. Tente novamente.')
    } finally { setSelected(null) }
  }

  return <section className="panel paywall" aria-labelledby="paywall-title">
    <div className="paywall__heading"><p className="eyebrow">Nutri-AI Premium</p><h2 id="paywall-title">Continue evoluindo com o Nutri-AI</h2><p>Seus 3 usos gratuitos terminaram. Escolha um plano para continuar criando e adaptando seus planos alimentares.</p></div>
    {error && <div className="notice notice--error" role="alert">{error}</div>}
    <div className="paywall__plans">{plans.map((plan) => <article className="paywall__plan" key={plan.code}><h3>{plan.name}</h3><p className="paywall__price"><strong>{plan.price}</strong> <span>{plan.period}</span></p><p className="paywall__equivalent">{plan.equivalent}</p><button className="button button--primary" type="button" disabled={selected !== null} onClick={() => void choose(plan.code)}>{selected === plan.code ? 'Abrindo checkout…' : `Escolher ${plan.code === 'MONTHLY' ? 'Mensal' : plan.code === 'QUARTERLY' ? 'Trimestral' : 'Anual'}`}</button></article>)}</div>
    <p className="paywall__same-access">Todos os planos oferecem o mesmo acesso Premium. Escolha apenas o período que combina com você.</p>
  </section>
}
