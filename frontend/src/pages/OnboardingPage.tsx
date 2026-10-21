import { useState, type FormEvent } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { FormField } from '../components/ui/FormField'
import { Surface } from '../components/ui/Surface'
import type { ActivityLevel, Goal, ProfileOnboardingDraft } from '../types/profile'
import './OnboardingPage.css'

interface Props {
  /** Answers to restore when the visitor comes back from the preview to change something. */
  initial?: ProfileOnboardingDraft
  onBack(): void
  onComplete(draft: ProfileOnboardingDraft): void
}

const goals: Array<[Goal, string, string]> = [
  ['WEIGHT_LOSS', 'Emagrecer', 'Perder peso comendo coisas que você consegue manter.'],
  ['MAINTENANCE', 'Manter o peso', 'Comer melhor sem mexer no peso.'],
  ['WEIGHT_GAIN', 'Ganhar peso', 'Ganhar peso com refeições mais reforçadas.'],
  ['MUSCLE_GAIN', 'Ganhar massa', 'Mais proteína para acompanhar o treino.'],
]

const activities: Array<[ActivityLevel, string, string]> = [
  ['SEDENTARY', 'Pouco ativo', 'A maior parte do dia é sentada ou com pouco movimento.'],
  ['LIGHT', 'Levemente ativo', 'Caminha um pouco ou treina uma ou duas vezes por semana.'],
  ['MODERATE', 'Moderadamente ativo', 'Treina três ou quatro vezes por semana.'],
  ['ACTIVE', 'Ativo', 'Treina quase todo dia ou passa o dia em pé, se mexendo.'],
  ['VERY_ACTIVE', 'Muito ativo', 'Treino puxado todo dia ou trabalho braçal.'],
]

// Allergies are asked before the preview: an allergy-blind preview could suggest something unsafe.
const allergyOptions = ['amendoim', 'frutos do mar', 'ovo', 'leite', 'glúten', 'soja']
const restrictionOptions = ['vegetariano', 'vegano', 'sem lactose', 'sem glúten']

const totalSteps = 5

function validBudget(value: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(value.trim()) && Number(value) <= 99_999_999.99
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export function OnboardingPage({ initial, onBack, onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [goal, setGoal] = useState<Goal | null>(initial?.goal ?? null)
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(initial?.activityLevel ?? null)
  const [mealsPerDay, setMealsPerDay] = useState<number | null>(initial?.mealsPerDay ?? null)
  const [weeklyFoodBudget, setWeeklyFoodBudget] = useState(initial?.weeklyFoodBudget ?? '')
  const [allergies, setAllergies] = useState<string[]>(initial?.foodAllergies ?? [])
  const [noAllergy, setNoAllergy] = useState(initial !== undefined && (initial.foodAllergies ?? []).length === 0)
  const [restrictions, setRestrictions] = useState<string[]>(initial?.foodRestrictions ?? [])
  const [otherFoods, setOtherFoods] = useState((initial?.dislikedFoods ?? []).join(', '))
  const budgetError = weeklyFoodBudget.length > 0 && !validBudget(weeklyFoodBudget)
  const stepValid = [goal !== null, activityLevel !== null, mealsPerDay !== null, validBudget(weeklyFoodBudget), noAllergy || allergies.length > 0][step]

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
      foodAllergies: noAllergy ? [] : allergies,
      foodRestrictions: restrictions,
      dislikedFoods: otherFoods.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 15),
    })
  }

  return <div className="onboarding-flow">
    <header className="onboarding-flow__header">
      <button className="onboarding-flow__brand" type="button" onClick={onBack} aria-label="Voltar para a página inicial"><BrandLogo/></button>
      <Badge variant="success">Seu plano começa aqui</Badge>
    </header>

    <main className="onboarding-flow__main">
      <aside className="onboarding-flow__intro">
        <p className="onboarding-flow__eyebrow">Antes de tudo</p>
        <h1>Cinco perguntas rápidas.</h1>
        <p>Com elas a Alyvora já sabe por onde começar seu cardápio. O que você responder aqui continua valendo quando criar a conta.</p>
        <ol aria-label="Progresso do onboarding">
          {['Objetivo', 'Atividade', 'Refeições', 'Orçamento', 'O que não come'].map((label, index) => <li className={index === step ? 'onboarding-flow__step onboarding-flow__step--current' : index < step ? 'onboarding-flow__step onboarding-flow__step--complete' : 'onboarding-flow__step'} aria-current={index === step ? 'step' : undefined} key={label}>
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
            <p>Escolha um. Dá para mudar depois.</p>
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
            <legend id="onboarding-step-title">Quanto você se mexe na semana?</legend>
            <p>Pense numa semana normal. Não precisa ser exato.</p>
            <div className="onboarding-flow__options">
              {activities.map(([value, label, description]) => <label className={activityLevel === value ? 'onboarding-option onboarding-option--compact onboarding-option--selected' : 'onboarding-option onboarding-option--compact'} key={value}>
                <input className="ui-visually-hidden" type="radio" name="activityLevel" value={value} checked={activityLevel === value} onChange={() => setActivityLevel(value)}/>
                <span className="onboarding-option__copy"><strong>{label}</strong><small>{description}</small></span>
                <span className="onboarding-option__check" aria-hidden="true">✓</span>
              </label>)}
            </div>
          </fieldset>}

          {step === 2 && <fieldset className="onboarding-flow__question">
            <legend id="onboarding-step-title">Quantas refeições você faz por dia?</legend>
            <p>Conte os lanches também. Escolha um número que você consegue manter.</p>
            <div className="onboarding-flow__meal-options">
              {[3, 4, 5, 6].map((value) => <label className={mealsPerDay === value ? 'onboarding-meal onboarding-meal--selected' : 'onboarding-meal'} key={value}>
                <input className="ui-visually-hidden" type="radio" name="mealsPerDay" value={value} checked={mealsPerDay === value} onChange={() => setMealsPerDay(value)}/>
                <strong>{value}</strong><span>refeições</span><i aria-hidden="true">✓</i>
              </label>)}
            </div>
          </fieldset>}

          {step === 3 && <fieldset className="onboarding-flow__question">
            <legend id="onboarding-step-title">Qual é seu orçamento semanal?</legend>
            <p>Um valor aproximado já serve. É ele que decide se o plano leva salmão ou sardinha.</p>
            <FormField id="onboarding-budget-input" label="Valor em reais" hint="Você poderá alterar esse valor depois." error={budgetError ? 'Informe um valor válido, com até duas casas decimais.' : undefined} required>
              {(controlProps) => <div className="onboarding-flow__budget">
                <span aria-hidden="true">R$</span>
                <input {...controlProps} type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01" placeholder="Ex.: 350" value={weeklyFoodBudget} onChange={(event) => setWeeklyFoodBudget(event.target.value)}/>
              </div>}
            </FormField>
            <div className="onboarding-flow__ready"><span aria-hidden="true">✓</span><p><strong>Falta uma</strong> Depois você já vê como fica a sua segunda-feira, antes de criar conta.</p></div>
          </fieldset>}

          {step === 4 && <fieldset className="onboarding-flow__question">
            <legend id="onboarding-step-title">Tem algo que você não come?</legend>
            <p>Alergia fica de fora sempre. Marque o que vale para você.</p>
            <fieldset className="onboarding-chips" aria-describedby="onboarding-allergy-hint">
              <legend>Alergias</legend>
              <div>
                {allergyOptions.map((value) => <label className={allergies.includes(value) ? 'onboarding-chip onboarding-chip--selected' : 'onboarding-chip'} key={value}>
                  <input className="ui-visually-hidden" type="checkbox" checked={allergies.includes(value)} onChange={() => { setAllergies((current) => toggle(current, value)); setNoAllergy(false) }}/>{value}
                </label>)}
                <label className={noAllergy ? 'onboarding-chip onboarding-chip--selected' : 'onboarding-chip'}>
                  <input className="ui-visually-hidden" type="checkbox" checked={noAllergy} onChange={() => { setNoAllergy((current) => !current); setAllergies([]) }}/>Nenhuma
                </label>
              </div>
              <small id="onboarding-allergy-hint">Escolha pelo menos uma opção, nem que seja "Nenhuma".</small>
            </fieldset>
            <fieldset className="onboarding-chips">
              <legend>Jeito de comer</legend>
              <div>
                {restrictionOptions.map((value) => <label className={restrictions.includes(value) ? 'onboarding-chip onboarding-chip--selected' : 'onboarding-chip'} key={value}>
                  <input className="ui-visually-hidden" type="checkbox" checked={restrictions.includes(value)} onChange={() => setRestrictions((current) => toggle(current, value))}/>{value}
                </label>)}
              </div>
            </fieldset>
            <FormField id="onboarding-other-foods" label="Outra coisa?" hint="Separe por vírgula. Opcional.">
              {(controlProps) => <input {...controlProps} type="text" maxLength={300} placeholder="fígado, berinjela…" value={otherFoods} onChange={(event) => setOtherFoods(event.target.value)}/>}
            </FormField>
          </fieldset>}

          <div className="onboarding-flow__actions">
            <Button variant="ghost" type="button" onClick={goBack}><span aria-hidden="true">←</span> {step === 0 ? 'Voltar ao início' : 'Voltar'}</Button>
            <Button type="submit" disabled={!stepValid}>{step === totalSteps - 1 ? 'Ver minha segunda-feira' : 'Continuar'} <span aria-hidden="true">→</span></Button>
          </div>
        </form>
      </Surface>
    </main>
  </div>
}
