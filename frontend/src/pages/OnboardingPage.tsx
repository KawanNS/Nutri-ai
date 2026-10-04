import { useState, type FormEvent } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { FormField } from '../components/ui/FormField'
import { Surface } from '../components/ui/Surface'
import type { ActivityLevel, Goal, ProfileOnboardingDraft } from '../types/profile'
import './OnboardingPage.css'

interface Props {
  onBack(): void
  onComplete(draft: ProfileOnboardingDraft): void
}

const goals: Array<[Goal, string, string]> = [
  ['WEIGHT_LOSS', 'Emagrecer', 'Reduzir peso com uma rotina alimentar possível.'],
  ['MAINTENANCE', 'Manter o peso', 'Organizar a alimentação sem buscar mudança de peso.'],
  ['WEIGHT_GAIN', 'Ganhar peso', 'Aumentar o peso de forma planejada.'],
  ['MUSCLE_GAIN', 'Ganhar massa', 'Apoiar uma rotina voltada a massa muscular.'],
]

const activities: Array<[ActivityLevel, string, string]> = [
  ['SEDENTARY', 'Pouco ativo', 'A maior parte do dia é sentada ou com pouco movimento.'],
  ['LIGHT', 'Levemente ativo', 'Movimento leve ou exercícios em alguns dias da semana.'],
  ['MODERATE', 'Moderadamente ativo', 'Exercícios ou movimento frequente durante a semana.'],
  ['ACTIVE', 'Ativo', 'Atividade intensa ou rotina fisicamente ativa.'],
  ['VERY_ACTIVE', 'Muito ativo', 'Treinos intensos e rotina com alto gasto físico.'],
]

const totalSteps = 4

function validBudget(value: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(value.trim()) && Number(value) <= 99_999_999.99
}

export function OnboardingPage({ onBack, onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [goal, setGoal] = useState<Goal | null>(null)
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(null)
  const [mealsPerDay, setMealsPerDay] = useState<number | null>(null)
  const [weeklyFoodBudget, setWeeklyFoodBudget] = useState('')
  const budgetError = weeklyFoodBudget.length > 0 && !validBudget(weeklyFoodBudget)
  const stepValid = [goal !== null, activityLevel !== null, mealsPerDay !== null, validBudget(weeklyFoodBudget)][step]

  function goBack() {
    if (step === 0) onBack()
    else setStep((current) => current - 1)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!stepValid) return
    if (step < totalSteps - 1) {
      setStep((current) => current + 1)
      return
    }
    onComplete({
      goal: goal as Goal,
      activityLevel: activityLevel as ActivityLevel,
      mealsPerDay: mealsPerDay as number,
      weeklyFoodBudget: weeklyFoodBudget.trim(),
    })
  }

  return <div className="onboarding-flow">
    <header className="onboarding-flow__header">
      <button className="onboarding-flow__brand" type="button" onClick={onBack} aria-label="Voltar para a página inicial"><BrandLogo/></button>
      <Badge variant="success">Seu plano começa aqui</Badge>
    </header>

    <main className="onboarding-flow__main">
      <aside className="onboarding-flow__intro">
        <p className="onboarding-flow__eyebrow">Seu ponto de partida</p>
        <h1>Um plano que começa pela sua rotina.</h1>
        <p>Responda quatro perguntas rápidas. Suas escolhas serão reaproveitadas quando você completar o perfil.</p>
        <ol aria-label="Progresso do onboarding">
          {['Objetivo', 'Atividade', 'Refeições', 'Orçamento'].map((label, index) => <li className={index === step ? 'onboarding-flow__step onboarding-flow__step--current' : index < step ? 'onboarding-flow__step onboarding-flow__step--complete' : 'onboarding-flow__step'} aria-current={index === step ? 'step' : undefined} key={label}>
            <span>{index < step ? '✓' : index + 1}</span><strong>{label}</strong>
          </li>)}
        </ol>
      </aside>

      <Surface as="section" level="raised" className="onboarding-flow__card" aria-labelledby="onboarding-step-title">
        <div className="onboarding-flow__progress">
          <span>Etapa {step + 1} de {totalSteps}</span>
          <div role="progressbar" aria-label="Progresso do onboarding" aria-valuemin={1} aria-valuemax={totalSteps} aria-valuenow={step + 1}><i style={{ width: `${((step + 1) / totalSteps) * 100}%` }}/></div>
        </div>

        <form onSubmit={handleSubmit}>
          {step === 0 && <fieldset className="onboarding-flow__question">
            <legend id="onboarding-step-title">Qual é o seu objetivo?</legend>
            <p>Escolha o resultado que mais combina com o seu momento.</p>
            <div className="onboarding-flow__options onboarding-flow__options--goals">
              {goals.map(([value, label, description]) => <label className={goal === value ? 'onboarding-option onboarding-option--selected' : 'onboarding-option'} key={value}>
                <input className="ui-visually-hidden" type="radio" name="goal" value={value} checked={goal === value} onChange={() => setGoal(value)}/>
                <span className="onboarding-option__number" aria-hidden="true">{String(goals.findIndex(([item]) => item === value) + 1).padStart(2, '0')}</span>
                <span className="onboarding-option__copy"><strong>{label}</strong><small>{description}</small></span>
                <span className="onboarding-option__check" aria-hidden="true">✓</span>
              </label>)}
            </div>
          </fieldset>}

          {step === 1 && <fieldset className="onboarding-flow__question">
            <legend id="onboarding-step-title">Como é sua rotina de atividade?</legend>
            <p>Considere uma semana comum, sem precisar buscar precisão absoluta.</p>
            <div className="onboarding-flow__options">
              {activities.map(([value, label, description]) => <label className={activityLevel === value ? 'onboarding-option onboarding-option--compact onboarding-option--selected' : 'onboarding-option onboarding-option--compact'} key={value}>
                <input className="ui-visually-hidden" type="radio" name="activityLevel" value={value} checked={activityLevel === value} onChange={() => setActivityLevel(value)}/>
                <span className="onboarding-option__copy"><strong>{label}</strong><small>{description}</small></span>
                <span className="onboarding-option__check" aria-hidden="true">✓</span>
              </label>)}
            </div>
          </fieldset>}

          {step === 2 && <fieldset className="onboarding-flow__question">
            <legend id="onboarding-step-title">Quantas refeições combinam com seu dia?</legend>
            <p>Escolha uma frequência que pareça viável para a sua rotina atual.</p>
            <div className="onboarding-flow__meal-options">
              {[3, 4, 5, 6].map((value) => <label className={mealsPerDay === value ? 'onboarding-meal onboarding-meal--selected' : 'onboarding-meal'} key={value}>
                <input className="ui-visually-hidden" type="radio" name="mealsPerDay" value={value} checked={mealsPerDay === value} onChange={() => setMealsPerDay(value)}/>
                <strong>{value}</strong><span>refeições</span><i aria-hidden="true">✓</i>
              </label>)}
            </div>
          </fieldset>}

          {step === 3 && <fieldset className="onboarding-flow__question">
            <legend id="onboarding-step-title">Qual é seu orçamento semanal?</legend>
            <p>Uma estimativa já ajuda a deixar as sugestões mais próximas da sua realidade.</p>
            <FormField id="onboarding-budget-input" label="Valor em reais" hint="Você poderá alterar esse valor depois." error={budgetError ? 'Informe um valor válido, com até duas casas decimais.' : undefined} required>
              {(controlProps) => <div className="onboarding-flow__budget">
                <span aria-hidden="true">R$</span>
                <input {...controlProps} type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01" placeholder="Ex.: 350" value={weeklyFoodBudget} onChange={(event) => setWeeklyFoodBudget(event.target.value)}/>
              </div>}
            </FormField>
            <div className="onboarding-flow__ready"><span aria-hidden="true">✓</span><p><strong>Última etapa</strong> Depois disso, você cria sua conta e completa somente os dados essenciais do perfil.</p></div>
          </fieldset>}

          <div className="onboarding-flow__actions">
            <Button variant="ghost" type="button" onClick={goBack}><span aria-hidden="true">←</span> {step === 0 ? 'Voltar ao início' : 'Voltar'}</Button>
            <Button type="submit" disabled={!stepValid}>{step === totalSteps - 1 ? 'Salvar e criar conta' : 'Continuar'} <span aria-hidden="true">→</span></Button>
          </div>
        </form>
      </Surface>
    </main>
  </div>
}
