import { useState, type FormEvent } from 'react'
import { FoodListField } from '../components/FoodListField'
import { ApiError } from '../services/api'
import { updateProfile } from '../services/profileService'
import type { ActivityLevel, Goal, Profile, ProfileOnboardingDraft, ProfilePayload, Sex } from '../types/profile'
import { today } from '../utils/date'

interface ProfilePageProps {
  profile?: Profile
  draft?: ProfileOnboardingDraft
  required: boolean
  onSaved(profile: Profile, wasFirstProfile: boolean): void
  onMealPlan(): void
  onProgress(): void
  onLogout(): void
}

interface FormState extends Omit<ProfilePayload, 'sex' | 'goal' | 'activityLevel' | 'mealsPerDay'> {
  sex: Sex | ''
  goal: Goal | ''
  activityLevel: ActivityLevel | ''
  mealsPerDay: string
}

const sexOptions: Array<[Sex, string]> = [['MALE', 'Masculino'], ['FEMALE', 'Feminino'], ['OTHER', 'Outro']]
const goalOptions: Array<[Goal, string]> = [['WEIGHT_LOSS', 'Emagrecimento'], ['MAINTENANCE', 'Manter peso'], ['WEIGHT_GAIN', 'Ganhar peso'], ['MUSCLE_GAIN', 'Ganhar massa muscular']]
const activityOptions: Array<[ActivityLevel, string]> = [['SEDENTARY', 'Sedentário'], ['LIGHT', 'Levemente ativo'], ['MODERATE', 'Moderadamente ativo'], ['ACTIVE', 'Ativo'], ['VERY_ACTIVE', 'Muito ativo']]
const listKeys = ['foodPreferences', 'likedFoods', 'dislikedFoods', 'foodRestrictions', 'foodAllergies'] as const

function initialState(profile?: Profile, draft?: ProfileOnboardingDraft): FormState {
  return {
    birthDate: profile?.birthDate.slice(0, 10) ?? '', sex: profile?.sex ?? '', heightCm: profile?.heightCm ?? '', weightKg: profile?.weightKg ?? '',
    goal: profile?.goal ?? draft?.goal ?? '', activityLevel: profile?.activityLevel ?? draft?.activityLevel ?? '', mealsPerDay: profile ? String(profile.mealsPerDay) : draft ? String(draft.mealsPerDay) : '', weeklyFoodBudget: profile?.weeklyFoodBudget ?? draft?.weeklyFoodBudget ?? '',
    foodPreferences: profile?.foodPreferences ?? [], likedFoods: profile?.likedFoods ?? [], dislikedFoods: profile?.dislikedFoods ?? [], foodRestrictions: profile?.foodRestrictions ?? [], foodAllergies: profile?.foodAllergies ?? [],
  }
}

function validDecimal(value: string, maximum: number, allowZero = false): boolean {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return false
  const number = Number(value)
  return Number.isFinite(number) && (allowZero ? number >= 0 : number > 0) && number <= maximum
}

export function ProfilePage({ profile, draft, required, onSaved, onMealPlan, onProgress, onLogout }: ProfilePageProps) {
  const [form, setForm] = useState<FormState>(() => initialState(profile, draft)), [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}), [error, setError] = useState<string | null>(null), [success, setSuccess] = useState<string | null>(null)
  function change<K extends keyof FormState>(key: K, value: FormState[K]) { setForm((current) => ({ ...current, [key]: value })); setFieldErrors((current) => ({ ...current, [key]: '' })) }
  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.birthDate) || form.birthDate > today()) errors.birthDate = 'Informe uma data válida e não futura.'
    if (!form.sex) errors.sex = 'Selecione o sexo.'
    if (!validDecimal(form.heightCm, 999.99)) errors.heightCm = 'Informe uma altura entre 0,01 e 999,99 cm, com até 2 casas.'
    if (!validDecimal(form.weightKg, 9999.99)) errors.weightKg = 'Informe um peso entre 0,01 e 9999,99 kg, com até 2 casas.'
    if (!form.goal) errors.goal = 'Selecione um objetivo.'
    if (!form.activityLevel) errors.activityLevel = 'Selecione o nível de atividade.'
    const meals = Number(form.mealsPerDay)
    if (!Number.isInteger(meals) || meals < 1 || meals > 10) errors.mealsPerDay = 'Informe um número inteiro entre 1 e 10.'
    if (!validDecimal(form.weeklyFoodBudget, 99_999_999.99, true)) errors.weeklyFoodBudget = 'Informe um valor entre 0 e 99999999,99, com até 2 casas.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving || !validate()) return
    setSaving(true); setError(null); setSuccess(null)
    const payload: ProfilePayload = { ...form, sex: form.sex as Sex, goal: form.goal as Goal, activityLevel: form.activityLevel as ActivityLevel, mealsPerDay: Number(form.mealsPerDay), birthDate: form.birthDate.trim(), heightCm: form.heightCm.trim(), weightKg: form.weightKg.trim(), weeklyFoodBudget: form.weeklyFoodBudget.trim() }
    try {
      const response = await updateProfile(payload)
      if (required) onSaved(response.profile, true)
      else { setForm(initialState(response.profile)); setSuccess('Perfil atualizado com sucesso.'); onSaved(response.profile, false) }
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 400) {
        const details = Object.fromEntries((requestError.details ?? []).map((detail) => [detail.field, 'Revise este campo.']))
        setFieldErrors((current) => ({ ...current, ...details })); setError('Alguns dados precisam ser revisados.')
      } else if (!(requestError instanceof ApiError && requestError.status === 401)) setError('Não foi possível salvar seu perfil agora. Tente novamente.')
    } finally { setSaving(false) }
  }
  const otherConflictLists = [...form.dislikedFoods, ...form.foodRestrictions, ...form.foodAllergies]
  return <div className="app-shell"><header className="topbar"><div className="topbar__content"><div className="brand"><span className="brand__mark" aria-hidden="true">N</span><span>Nutri-AI</span></div><nav className="topbar__actions" aria-label="Navegação principal">{!required && <button className="nav-button" type="button" onClick={onMealPlan}>Plano alimentar</button>}<button className="nav-button nav-button--active" type="button">Perfil</button>{!required && <button className="nav-button" type="button" onClick={onProgress}>Evolução</button>}<button className="logout-button" type="button" onClick={onLogout}>Sair</button></nav></div></header>
    <main className="page profile-page"><div className="page-heading"><div><p className="eyebrow">Perfil nutricional</p><h1>{required ? 'Vamos conhecer você.' : 'Suas preferências, do seu jeito.'}</h1><p>{required ? 'Precisamos destes dados para personalizar sua experiência antes de liberar a evolução.' : 'Mantenha seus dados atualizados para recomendações mais alinhadas à sua rotina.'}</p></div></div>
      {required && <div className="notice notice--info">Complete seu perfil para acessar a área de Evolução.</div>}{error && <div className="notice notice--error" role="alert">{error}</div>}{success && <div className="notice notice--success" role="status">{success}</div>}
      <form className="profile-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <section className="panel"><div className="panel__header"><div><h2>Dados pessoais</h2><p className="panel__subtitle">Informações essenciais para seus cálculos nutricionais.</p></div></div><div className="profile-fields">
          <div className="field"><label htmlFor="birthDate">Data de nascimento</label><input id="birthDate" type="date" max={today()} value={form.birthDate} onChange={(event) => change('birthDate', event.target.value)}/>{fieldErrors.birthDate && <span className="field-error">{fieldErrors.birthDate}</span>}</div>
          <div className="field"><label htmlFor="sex">Sexo</label><select id="sex" value={form.sex} onChange={(event) => change('sex', event.target.value as Sex | '')}><option value="">Selecione</option>{sexOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{fieldErrors.sex && <span className="field-error">{fieldErrors.sex}</span>}</div>
          <div className="field"><label htmlFor="heightCm">Altura (cm)</label><input id="heightCm" type="number" inputMode="decimal" min="0.01" max="999.99" step="0.01" value={form.heightCm} onChange={(event) => change('heightCm', event.target.value)} placeholder="Ex.: 175"/>{fieldErrors.heightCm && <span className="field-error">{fieldErrors.heightCm}</span>}</div>
          <div className="field"><label htmlFor="profileWeightKg">Peso (kg)</label><input id="profileWeightKg" type="number" inputMode="decimal" min="0.01" max="9999.99" step="0.01" value={form.weightKg} onChange={(event) => change('weightKg', event.target.value)} placeholder="Ex.: 72,5"/>{fieldErrors.weightKg && <span className="field-error">{fieldErrors.weightKg}</span>}</div>
          <div className="field"><label htmlFor="goal">Objetivo</label><select id="goal" value={form.goal} onChange={(event) => change('goal', event.target.value as Goal | '')}><option value="">Selecione</option>{goalOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{fieldErrors.goal && <span className="field-error">{fieldErrors.goal}</span>}</div>
          <div className="field"><label htmlFor="activityLevel">Nível de atividade</label><select id="activityLevel" value={form.activityLevel} onChange={(event) => change('activityLevel', event.target.value as ActivityLevel | '')}><option value="">Selecione</option>{activityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{fieldErrors.activityLevel && <span className="field-error">{fieldErrors.activityLevel}</span>}</div>
          <div className="field"><label htmlFor="mealsPerDay">Refeições por dia</label><input id="mealsPerDay" type="number" inputMode="numeric" min="1" max="10" step="1" value={form.mealsPerDay} onChange={(event) => change('mealsPerDay', event.target.value)}/>{fieldErrors.mealsPerDay && <span className="field-error">{fieldErrors.mealsPerDay}</span>}</div>
          <div className="field"><label htmlFor="weeklyFoodBudget">Orçamento semanal para alimentação</label><input id="weeklyFoodBudget" type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01" value={form.weeklyFoodBudget} onChange={(event) => change('weeklyFoodBudget', event.target.value)} placeholder="Ex.: 350"/>{fieldErrors.weeklyFoodBudget && <span className="field-error">{fieldErrors.weeklyFoodBudget}</span>}</div>
        </div></section>
        <section className="panel"><div className="panel__header"><div><h2>Alimentação e preferências</h2><p className="panel__subtitle">Adicione cada alimento separadamente. Você poderá removê-los quando quiser.</p></div></div><div className="food-grid">
          <FoodListField id="foodPreferences" label="Preferências alimentares" items={form.foodPreferences} onChange={(items) => change('foodPreferences', items)}/>
          <FoodListField id="likedFoods" label="Alimentos que gosta" items={form.likedFoods} conflictsWith={otherConflictLists} onChange={(items) => change('likedFoods', items)}/>
          <FoodListField id="dislikedFoods" label="Alimentos que não gosta" items={form.dislikedFoods} conflictsWith={form.likedFoods} onChange={(items) => change('dislikedFoods', items)}/>
          <FoodListField id="foodRestrictions" label="Restrições alimentares" items={form.foodRestrictions} conflictsWith={form.likedFoods} onChange={(items) => change('foodRestrictions', items)}/>
          <FoodListField id="foodAllergies" label="Alergias alimentares" items={form.foodAllergies} conflictsWith={form.likedFoods} onChange={(items) => change('foodAllergies', items)}/>
        </div>{listKeys.some((key) => fieldErrors[key]) && <p className="field-error">Revise as listas de alimentos indicadas.</p>}</section>
        <div className="profile-actions"><button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Salvando…' : required ? 'Salvar e continuar' : 'Salvar alterações'}</button></div>
      </form>
    </main></div>
}
