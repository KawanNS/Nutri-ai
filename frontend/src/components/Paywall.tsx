import { useState } from 'react'
import { ApiError } from '../services/api'
import { startCheckout } from '../services/billingService'
import type { SubscriptionPlan } from '../types/subscription'
import { subscriptionPlans } from '../data/subscriptionPlans'

export function Paywall() {
  const [selected, setSelected] = useState<SubscriptionPlan | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function choose(plan: SubscriptionPlan) {
    setSelected(plan); setError(null)
    try {
      const { checkoutUrl } = await startCheckout(plan)
      window.location.assign(checkoutUrl)
    } catch (requestError) {
      setError(requestError instanceof ApiError && requestError.code === 'CAKTO_CHECKOUT_NOT_CONFIGURED'
        ? 'O checkout seguro está em configuração. Tente novamente em breve.'
        : 'Não foi possível iniciar o checkout agora. Tente novamente.')
    } finally { setSelected(null) }
  }

  return <section className="panel paywall" aria-labelledby="paywall-title">
    <div className="paywall__heading"><p className="eyebrow">Nutri-AI Premium</p><h2 id="paywall-title">Continue evoluindo com o Nutri-AI</h2><p>Seus 3 usos gratuitos terminaram. Escolha um plano para continuar criando e adaptando seus planos alimentares.</p></div>
    {error && <div className="notice notice--error" role="alert">{error}</div>}
    <div className="paywall__plans">{subscriptionPlans.map((plan) => <article className="paywall__plan" key={plan.code}><h3>{plan.name}</h3><p className="paywall__price"><strong>{plan.price}</strong> <span>{plan.period}</span></p><p className="paywall__equivalent">{plan.equivalent}</p><button className="button button--primary" type="button" disabled={selected !== null} onClick={() => void choose(plan.code)}>{selected === plan.code ? 'Abrindo checkout…' : `Escolher ${plan.shortName}`}</button></article>)}</div>
    <p className="paywall__same-access">Todos os planos oferecem o mesmo acesso Premium. Escolha apenas o período que combina com você.</p>
  </section>
}
