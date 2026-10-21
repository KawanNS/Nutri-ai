import { useEffect, useRef, useState } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { MacroBar } from '../components/motion/MacroBar'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { LoadingState } from '../components/ui/LoadingState'
import { ApiError } from '../services/api'
import { getPlanPreview } from '../services/planPreviewService'
import type { PlanPreview } from '../types/planPreview'
import type { Goal, ProfileOnboardingDraft } from '../types/profile'
import './PlanPreviewPage.css'

interface Props {
  draft: ProfileOnboardingDraft
  /** Kept by the app so coming back from sign-up does not spend another preview. */
  preview?: PlanPreview
  onLoaded(preview: PlanPreview): void
  onBack(): void
  onRegister(): void
  onHome(): void
}

const goalText: Record<Goal, string> = {
  WEIGHT_LOSS: 'Para emagrecer',
  MAINTENANCE: 'Para manter o peso',
  WEIGHT_GAIN: 'Para ganhar peso',
  MUSCLE_GAIN: 'Para ganhar massa',
}

const lockedDays = ['Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const whole = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })

/** "Para ganhar massa, sem frutos do mar e sem lactose, até R$ 250 na semana." */
function summaryLine(draft: ProfileOnboardingDraft): string {
  const exclusions = [...(draft.foodAllergies ?? []), ...(draft.foodRestrictions ?? []).map((item) => item.replace(/^sem /, ''))]
    .map((item) => `sem ${item}`)
  const budget = currency.format(Number(draft.weeklyFoodBudget)).replace(/,00$/, '')
  return [goalText[draft.goal], ...exclusions, `até ${budget} na semana`].join(', ') + '.'
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && (error.code === 'PLAN_PREVIEW_RATE_LIMIT_EXCEEDED' || error.code === 'PLAN_PREVIEW_BUSY')) {
    return 'Você já viu várias prévias agora. Crie sua conta para montar o plano completo.'
  }
  return 'Não deu para montar a prévia agora. Tente de novo ou crie sua conta para ver o plano completo.'
}

export function PlanPreviewPage({ draft, preview, onLoaded, onBack, onRegister, onHome }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!preview)
  const [attempt, setAttempt] = useState(0)
  const requested = useRef(-1)

  useEffect(() => {
    // One request per attempt, also under React's double-invoked effects in development.
    if (preview || requested.current === attempt) return
    requested.current = attempt
    getPlanPreview(draft)
      .then(({ preview: loaded }) => onLoaded(loaded))
      .catch((requestError: unknown) => setError(errorMessage(requestError)))
      .finally(() => setLoading(false))
  }, [attempt, draft, preview, onLoaded])

  function retry() {
    setError(null)
    setLoading(true)
    setAttempt((current) => current + 1)
  }

  return <div className="plan-preview">
    <header className="plan-preview__header">
      <button className="plan-preview__brand" type="button" onClick={onHome} aria-label="Voltar para a página inicial"><BrandLogo/></button>
      <button className="plan-preview__back" type="button" onClick={onBack}><span aria-hidden="true">←</span> Mudar respostas</button>
    </header>

    <main className="plan-preview__main" aria-live="polite" aria-busy={loading}>
      {loading && <div className="plan-preview__loading"><LoadingState label="Montando sua segunda-feira…" description="Leva uns 10 segundos."/></div>}

      {!loading && error && <div className="plan-preview__error">
        <Alert variant="error" title="Prévia indisponível">{error}</Alert>
        <div className="plan-preview__error-actions">
          <Button variant="secondary" onClick={retry}>Tentar de novo</Button>
          <Button onClick={onRegister}>Criar conta</Button>
        </div>
      </div>}

      {!loading && !error && preview && <>
        <section className="plan-preview__day" aria-labelledby="plan-preview-title">
          <h1 id="plan-preview-title">Sua segunda-feira</h1>
          <p className="plan-preview__summary">{summaryLine(draft)}</p>
          <dl className="plan-preview__stats">
            <div><dt>Calorias</dt><dd>~{whole.format(preview.totals.caloriesKcal)}<span>kcal</span></dd></div>
            <div><dt>Custo do dia</dt><dd>{currency.format(preview.estimatedDailyCost)}</dd></div>
          </dl>
          <MacroBar proteinGrams={preview.totals.proteinGrams} carbohydrateGrams={preview.totals.carbohydrateGrams} fatGrams={preview.totals.fatGrams}/>
          <ol className="plan-preview__meals">
            {preview.meals.map((meal, index) => <li key={`${meal.name}-${index}`} style={{ animationDelay: `${index * 70}ms` }}>
              <time>{meal.suggestedTime ?? ''}</time>
              <div><strong>{meal.name}</strong><span>{meal.foods.map((food) => food.name).join(', ')}</span></div>
              <b>{whole.format(meal.estimatedNutrition.caloriesKcal)} kcal</b>
            </li>)}
          </ol>
          <p className="plan-preview__note">Quantidades aproximadas: ajustamos ao seu corpo quando você completar o perfil.</p>
        </section>

        <section className="plan-preview__locked" aria-labelledby="plan-preview-locked-title">
          <div className="plan-preview__days" aria-hidden="true">{lockedDays.map((day) => <span key={day}>{day}</span>)}<svg className="plan-preview__lock" viewBox="0 0 24 24" focusable="false"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>
          <h2 id="plan-preview-locked-title">Mais 6 dias e a lista de compras</h2>
          <p>Crie sua conta grátis para ver a semana inteira. Sem cartão.</p>
          <Button fullWidth onClick={onRegister}>Criar conta e ver a semana <span aria-hidden="true">→</span></Button>
        </section>
      </>}
    </main>
  </div>
}
