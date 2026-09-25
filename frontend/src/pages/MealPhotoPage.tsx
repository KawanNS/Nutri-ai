import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { ApiError } from '../services/api'
import { analyzeMealPhoto, confirmMealPhoto } from '../services/mealPhotoService'
import type { FoodEstimateConfidence, MealPhotoAnalysis, MealPhotoFood } from '../types/mealPhoto'

interface MealPhotoPageProps {
  onMealPlan(): void
  onChat(): void
  onProfile(): void
  onProgress(): void
  onLogout(): void
}

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
const maxBytes = 5 * 1024 * 1024
const confidenceLabels: Record<FoodEstimateConfidence, string> = {
  UNKNOWN: 'Não determinada',
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
}
const emptyFood = (): MealPhotoFood => ({
  name: '',
  portionDescription: '',
  estimatedCaloriesKcal: null,
  estimatedProteinGrams: null,
  estimatedCarbohydrateGrams: null,
  estimatedFatGrams: null,
  confidence: 'UNKNOWN',
  limitations: [],
})

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'IMAGE_TOO_LARGE') return 'A imagem deve ter no máximo 5 MB.'
    if (error.code === 'EMPTY_IMAGE') return 'A imagem selecionada está vazia.'
    if (error.code === 'UNSUPPORTED_IMAGE_TYPE' || error.code === 'INVALID_IMAGE') return 'Use uma imagem JPEG, PNG ou WebP válida.'
    if (error.code === 'PHOTO_RATE_LIMIT_EXCEEDED') return 'Muitas análises em pouco tempo. Aguarde um minuto.'
    if (error.code === 'INVALID_PHOTO_ANALYSIS') return 'A IA não conseguiu produzir uma análise válida desta foto.'
    if (error.code === 'PHOTO_ANALYSIS_TEMPORARILY_UNAVAILABLE') return 'A análise está temporariamente indisponível.'
  }
  return 'Não foi possível concluir esta etapa. Tente novamente.'
}

function nullableNumber(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function MealPhotoPage({ onMealPlan, onChat, onProfile, onProgress, onLogout }: MealPhotoPageProps) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<MealPhotoAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const galleryInput = useRef<HTMLInputElement | null>(null)
  const cameraInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) return
    if (!allowedTypes.includes(selected.type) || selected.size === 0 || selected.size > maxBytes) {
      const message = selected.size > maxBytes
        ? 'A imagem deve ter no máximo 5 MB.'
        : selected.size === 0
          ? 'A imagem selecionada está vazia.'
          : 'Use uma imagem JPEG, PNG ou WebP válida.'
      setError(message)
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setFile(selected)
    setPreview(URL.createObjectURL(selected))
    setAnalysis(null)
    setConfirmed(null)
    setError(null)
  }

  function clearPhoto() {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
    setAnalysis(null)
    setConfirmed(null)
    setError(null)
  }

  async function analyze() {
    if (!file || analyzing) return
    setAnalyzing(true)
    setError(null)
    setConfirmed(null)
    try {
      setAnalysis((await analyzeMealPhoto(file)).analysis)
    } catch (requestError) {
      setError(messageFor(requestError))
    } finally {
      setAnalyzing(false)
    }
  }

  function updateFood(index: number, patch: Partial<MealPhotoFood>) {
    setAnalysis((current) => current
      ? { ...current, foods: current.foods.map((food, position) => position === index ? { ...food, ...patch } : food) }
      : current)
    setConfirmed(null)
  }

  function removeFood(index: number) {
    setAnalysis((current) => current
      ? { ...current, foods: current.foods.filter((_food, position) => position !== index) }
      : current)
    setConfirmed(null)
  }

  function addFood() {
    setAnalysis((current) => current ? { ...current, foods: [...current.foods, emptyFood()] } : current)
    setConfirmed(null)
  }

  async function confirm() {
    if (!analysis || confirming) return
    if (analysis.foods.length === 0 || analysis.foods.some((food) => !food.name.trim() || !food.portionDescription.trim())) {
      setError('Revise o nome e a porção de pelo menos um alimento antes de confirmar.')
      return
    }
    setConfirming(true)
    setError(null)
    const uncertaintyNotes = [...new Set([
      ...analysis.observations,
      ...analysis.undeterminedItems.map((item) => `Não determinado: ${item}`),
      ...analysis.foods.flatMap((food) => food.limitations),
    ])].slice(0, 20)
    try {
      const result = await confirmMealPhoto({
        foods: analysis.foods,
        notes: analysis.observations.join(' ') || null,
        uncertaintyNotes,
      })
      setConfirmed(result.foodLog.id)
    } catch (requestError) {
      setError(messageFor(requestError))
    } finally {
      setConfirming(false)
    }
  }

  return <div className="app-shell">
    <header className="topbar"><div className="topbar__content"><div className="brand"><BrandLogo/></div><nav className="topbar__actions" aria-label="Navegação principal"><button className="nav-button" onClick={onMealPlan}>Plano alimentar</button><button className="nav-button" onClick={onChat}>Assistente</button><button className="nav-button nav-button--active" aria-current="page">Foto do prato</button><button className="nav-button" onClick={onProfile}>Perfil</button><button className="nav-button" onClick={onProgress}>Evolução</button><button className="logout-button" onClick={onLogout}>Sair</button></nav></div></header>
    <main className="page meal-photo-page">
      <div className="page-heading"><div><p className="eyebrow">Registro alimentar</p><h1>O que tem no seu prato?</h1><p>Envie uma foto, revise as estimativas da IA e confirme somente quando estiver correto.</p></div></div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      {confirmed && <div className="notice notice--success" role="status">Refeição confirmada e registrada. A foto não foi armazenada.</div>}

      <section className="panel photo-upload-panel">
        <div className="panel__header"><div><h2>1. Escolha a foto</h2><p className="panel__subtitle">JPEG, PNG ou WebP, até 5 MB.</p></div></div>
        <input ref={galleryInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Selecionar imagem do prato" onChange={choose}/>
        <input ref={cameraInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Fotografar o prato" onChange={choose}/>
        {!preview
          ? <div className="photo-picker"><span className="photo-picker__icon" aria-hidden="true">○</span><p>Nenhuma imagem selecionada</p><div className="photo-actions"><button className="button button--primary" type="button" onClick={() => galleryInput.current?.click()}>Selecionar imagem</button><button className="button button--secondary" type="button" onClick={() => cameraInput.current?.click()}>Usar câmera</button></div></div>
          : <div className="photo-preview"><img src={preview} alt="Prévia do prato selecionado"/><div className="photo-actions"><button className="button button--secondary" type="button" disabled={analyzing} onClick={() => galleryInput.current?.click()}>Trocar foto</button><button className="button button--ghost" type="button" disabled={analyzing} onClick={clearPhoto}>Remover</button><button className="button button--primary" type="button" disabled={analyzing} onClick={() => void analyze()}>{analyzing ? 'Analisando…' : 'Analisar prato'}</button></div></div>}
        <p className="photo-privacy">A imagem é enviada somente para a análise e descartada depois. Ela não integra o registro alimentar.</p>
      </section>

      {analyzing && <section className="panel generation-loading" aria-live="polite"><span className="spinner"/><div><h2>Observando o prato…</h2><p>Identificando alimentos e estimativas visuais, sem assumir precisão que a foto não oferece.</p></div></section>}

      {analysis && <section className="photo-review">
        <div className="section-heading"><p className="eyebrow">Estimativa da IA</p><h2>2. Revise antes de confirmar</h2><p>Altere nomes, porções e valores; remova enganos ou acrescente alimentos ausentes.</p></div>
        <div className="notice notice--warning photo-estimate-warning" role="note"><strong>Esta análise é apenas uma estimativa.</strong><span>A foto não garante peso, quantidade, ingredientes escondidos, óleos, molhos ou calorias exatas. Corrija os dados antes de registrar.</span></div>
        {analysis.observations.length > 0 && <div className="notice notice--info"><strong>Limitações observadas:</strong> {analysis.observations.join(' ')}</div>}
        {analysis.undeterminedItems.length > 0 && <div className="notice notice--info"><strong>Não foi possível determinar:</strong> {analysis.undeterminedItems.join(', ')}</div>}
        <div className="photo-food-list">{analysis.foods.map((food, index) => <FoodEditor key={index} food={food} index={index} onChange={updateFood} onRemove={removeFood}/>)}</div>
        <button className="button button--secondary photo-add-food" type="button" onClick={addFood}>Adicionar alimento</button>
        <div className="photo-confirm"><div><strong>Confirmação obrigatória</strong><p>Somente os dados revisados serão registrados. Os valores continuam sendo estimativas.</p></div><button className="button button--primary" type="button" disabled={confirming || Boolean(confirmed)} onClick={() => void confirm()}>{confirming ? 'Confirmando…' : confirmed ? 'Refeição confirmada' : 'Confirmar e registrar'}</button></div>
      </section>}
    </main>
  </div>
}

function FoodEditor({ food, index, onChange, onRemove }: { food: MealPhotoFood; index: number; onChange(index: number, patch: Partial<MealPhotoFood>): void; onRemove(index: number): void }) {
  const numeric: Array<[keyof Pick<MealPhotoFood, 'estimatedCaloriesKcal' | 'estimatedProteinGrams' | 'estimatedCarbohydrateGrams' | 'estimatedFatGrams'>, string]> = [
    ['estimatedCaloriesKcal', 'Calorias (kcal)'],
    ['estimatedProteinGrams', 'Proteína (g)'],
    ['estimatedCarbohydrateGrams', 'Carboidratos (g)'],
    ['estimatedFatGrams', 'Gorduras (g)'],
  ]
  return <article className="panel photo-food-card">
    <div className="photo-food-card__heading"><strong>Alimento {index + 1}</strong><span className={`confidence confidence--${food.confidence.toLowerCase()}`}>Confiança: {confidenceLabels[food.confidence]}</span><button type="button" className="button button--ghost" onClick={() => onRemove(index)}>Remover</button></div>
    <div className="photo-food-fields">
      <label className="photo-food-fields__wide">Nome<input value={food.name} maxLength={120} onChange={(event) => onChange(index, { name: event.target.value })}/></label>
      <label className="photo-food-fields__wide">Porção estimada<input value={food.portionDescription} maxLength={240} onChange={(event) => onChange(index, { portionDescription: event.target.value })}/></label>
      {numeric.map(([field, label]) => <label key={field}>{label}<input type="number" inputMode="decimal" min="0" step="0.1" value={food[field] ?? ''} placeholder="Não determinado" onChange={(event) => onChange(index, { [field]: nullableNumber(event.target.value) })}/></label>)}
      <label>Confiança da estimativa<select value={food.confidence} onChange={(event) => onChange(index, { confidence: event.target.value as FoodEstimateConfidence })}>{Object.entries(confidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    {food.limitations.length > 0 && <p className="photo-limitations"><strong>Limitações:</strong> {food.limitations.join(' ')}</p>}
  </article>
}
