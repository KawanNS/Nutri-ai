import { useState } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import type { ActivityLevel, Goal, ProfileOnboardingDraft } from '../types/profile'

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

const activities: Array<[ActivityLevel, string]> = [
  ['SEDENTARY', 'Pouco ativo'],
  ['LIGHT', 'Levemente ativo'],
  ['MODERATE', 'Moderadamente ativo'],
  ['ACTIVE', 'Ativo'],
  ['VERY_ACTIVE', 'Muito ativo'],
]

function validBudget(value: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(value.trim()) && Number(value) <= 99_999_999.99
}

export function OnboardingPage({ onBack, onComplete }: Props) {
  const [goal, setGoal] = useState<Goal | null>(null)
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(null)
  const [mealsPerDay, setMealsPerDay] = useState<number | null>(null)
  const [weeklyFoodBudget, setWeeklyFoodBudget] = useState('')
  const complete = goal !== null && activityLevel !== null && mealsPerDay !== null && validBudget(weeklyFoodBudget)

  return <div className="onboarding-page"><header className="landing-header"><div className="landing-nav"><button className="brand brand--button" type="button" onClick={onBack}><BrandLogo/></button><button className="nav-button" type="button" onClick={onBack}>Voltar</button></div></header>
    <main className="onboarding"><div className="onboarding-heading"><p className="eyebrow">Seu ponto de partida</p><h1>Monte a base do seu plano antes de criar a conta.</h1><p>Quatro respostas rápidas. Você completa os dados pessoais somente quando for salvar.</p></div>
      <section className="onboarding-question" aria-labelledby="onboarding-goal"><div><span>01</span><h2 id="onboarding-goal">Qual é seu objetivo?</h2></div><div className="onboarding-goals">{goals.map(([value, label, description]) => <button className={goal === value ? 'choice-card choice-card--selected' : 'choice-card'} type="button" aria-pressed={goal === value} key={value} onClick={() => setGoal(value)}><strong>{label}</strong><small>{description}</small></button>)}</div></section>
      <section className="onboarding-question" aria-labelledby="onboarding-activity"><div><span>02</span><h2 id="onboarding-activity">Como é sua rotina de atividade?</h2></div><div className="choice-chips">{activities.map(([value, label]) => <button className={activityLevel === value ? 'choice-chip choice-chip--selected' : 'choice-chip'} type="button" aria-pressed={activityLevel === value} key={value} onClick={() => setActivityLevel(value)}>{label}</button>)}</div></section>
      <section className="onboarding-question" aria-labelledby="onboarding-meals"><div><span>03</span><h2 id="onboarding-meals">Quantas refeições combinam com seu dia?</h2></div><div className="choice-chips">{[3, 4, 5, 6].map((value) => <button className={mealsPerDay === value ? 'choice-chip choice-chip--selected' : 'choice-chip'} type="button" aria-pressed={mealsPerDay === value} key={value} onClick={() => setMealsPerDay(value)}>{value} refeições</button>)}</div></section>
      <section className="onboarding-question onboarding-question--budget" aria-labelledby="onboarding-budget"><div><span>04</span><h2 id="onboarding-budget">Qual é seu orçamento semanal?</h2><p>Uma estimativa já ajuda. Você poderá alterar depois.</p></div><div className="field"><label htmlFor="onboarding-budget-input">Valor em reais</label><input id="onboarding-budget-input" type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01" placeholder="Ex.: 350" value={weeklyFoodBudget} onChange={(event) => setWeeklyFoodBudget(event.target.value)}/>{weeklyFoodBudget && !validBudget(weeklyFoodBudget) && <span className="field-error">Informe um valor válido, com até duas casas decimais.</span>}</div></section>
      <div className="onboarding-finish"><div><strong>Pronto para continuar?</strong><p>Crie sua conta para guardar estas respostas e completar seu perfil.</p></div><button className="button button--primary" type="button" disabled={!complete} onClick={() => { if (complete) onComplete({ goal, activityLevel, mealsPerDay, weeklyFoodBudget: weeklyFoodBudget.trim() }) }}>Salvar e criar conta</button></div>
    </main>
  </div>
}
