import { useEffect, useRef, useState } from 'react'
import { AlyvoraLoader } from '../components/AlyvoraLoader'
import { BrandLogo } from '../components/BrandLogo'
import { MacroBar } from '../components/motion/MacroBar'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { ApiError } from '../services/api'
import { getPlanPreviewWithRetry } from '../services/planPreviewService'
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

// What the AI is doing, by seconds waited. It usually takes 10-20 s; the first visit of the day
// can take up to ~30 s while the server wakes up, so the copy never promises a fixed time.
const loadingSteps: Array<[number, string]> = [
  [0, 'Lendo suas respostas…'],
  [3, 'Escolhendo as refeições do dia…'],
  [9, 'Calculando calorias e custo…'],
  [16, 'Conferindo o seu orçamento…'],
  [24, 'Quase pronto…'],
]

function PreviewLoading() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const timer = window.setInterval(() => setSeconds((Date.now() - started) / 1000), 250)
    return () => window.clearInterval(timer)
  }, [])
  const step = [...loadingSteps].reverse().find(([from]) => seconds >= from)?.[1] ?? loadingSteps[0][1]
  // Eases toward 95% and never claims to be done before the answer arrives.
  const progress = Math.round(95 * (1 - Math.exp(-seconds / 11)))
  return <div className="plan-preview__loading" role="status" aria-live="polite">
    <AlyvoraLoader size={88}/>
    <strong>Montando sua segunda-feira</strong>
    <p className="plan-preview__loading-step">{step}</p>
    <span className="plan-preview__progress" aria-hidden="true"><i style={{ width: `${progress}%` }}/></span>
    <small>Pode levar até meio minuto. Não feche esta página.</small>
  </div>
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
    getPlanPreviewWithRetry(draft)
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
      {loading && <PreviewLoading/>}

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
