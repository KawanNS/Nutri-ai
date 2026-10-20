import { useState } from 'react'
import { ApiError } from '../services/api'
import { startCheckout } from '../services/billingService'
import type { SubscriptionPlan } from '../types/subscription'
import { subscriptionPlans } from '../data/subscriptionPlans'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'

interface PaywallProps {
  title?: string
  description?: string
}

export function Paywall({
  title = 'Continue evoluindo com a Alyvora',
  description = 'Seus 3 usos gratuitos terminaram. Escolha um plano para continuar criando e adaptando seus planos alimentares.',
}: PaywallProps) {
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

  return <section className="paywall" aria-labelledby="paywall-title">
    <div className="paywall__heading"><h2 id="paywall-title">{title}</h2><p>{description}</p></div>
    {error && <Alert variant="error">{error}</Alert>}
    <ul className="paywall__plans">{subscriptionPlans.map((plan) => <li className="paywall__plan" key={plan.code}>
      <div><h3>{plan.shortName}</h3><p className="paywall__price"><strong>{plan.price}</strong> <span>{plan.period}</span></p><p className="paywall__equivalent">{plan.equivalent}</p></div>
      <Button variant={plan.code === 'ANNUAL' ? 'primary' : 'secondary'} aria-label={`Escolher ${plan.name}`} loading={selected === plan.code} loadingLabel="Abrindo checkout" disabled={selected !== null} onClick={() => void choose(plan.code)}>Escolher</Button>
    </li>)}</ul>
    <p className="paywall__same-access">Todos os planos oferecem o mesmo acesso Premium. Escolha apenas o período que combina com você.</p>
  </section>
}
