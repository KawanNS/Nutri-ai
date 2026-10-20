import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { AppTopbar } from '../components/layout/AppTopbar'
import { PageHeader } from '../components/layout/PageHeader'
import { Paywall } from '../components/Paywall'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { FormField } from '../components/ui/FormField'
import { LoadingState } from '../components/ui/LoadingState'
import { Surface } from '../components/ui/Surface'
import { ApiError } from '../services/api'
import { getSubscription } from '../services/billingService'
import { analyzeMealPhoto, confirmMealPhoto } from '../services/mealPhotoService'
import type { FoodEstimateConfidence, MealPhotoAnalysis, MealPhotoFood } from '../types/mealPhoto'
import './MealPhotoPage.css'

interface MealPhotoPageProps {
  onMealPlan(): void
  onChat(): void
  onDiary(): void
  onProgress(): void
}

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
const maxBytes = 5 * 1024 * 1024
const confidenceLabels: Record<FoodEstimateConfidence, string> = {
  UNKNOWN: 'Não determinada',
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
}
const confidenceVariants: Record<FoodEstimateConfidence, 'neutral' | 'error' | 'warning' | 'success'> = {
  UNKNOWN: 'neutral',
  LOW: 'error',
  MEDIUM: 'warning',
  HIGH: 'success',
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

export function MealPhotoPage({ onMealPlan, onChat, onDiary, onProgress }: MealPhotoPageProps) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<MealPhotoAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const [premium, setPremium] = useState<boolean | null>(null)
  const [premiumCheckError, setPremiumCheckError] = useState(false)
  const [premiumCheckKey, setPremiumCheckKey] = useState(0)
  const galleryInput = useRef<HTMLInputElement | null>(null)
  const cameraInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  useEffect(() => {
    let active = true
    void getSubscription()
      .then(({ subscription }) => { if (active) setPremium(subscription.isPremium) })
      .catch((requestError) => {
        if (active && !(requestError instanceof ApiError && requestError.status === 401)) setPremiumCheckError(true)
      })
    return () => { active = false }
  }, [premiumCheckKey])

  function handleRequestError(requestError: unknown) {
    if (requestError instanceof ApiError && requestError.code === 'PREMIUM_REQUIRED') {
      setPremium(false)
      setPremiumCheckError(false)
      setError(null)
      return
    }
    setError(messageFor(requestError))
  }

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
      handleRequestError(requestError)
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
      handleRequestError(requestError)
    } finally {
      setConfirming(false)
    }
  }

  return <div className="app-shell">
    <AppTopbar active="meal-photo" onMealPlan={onMealPlan} onChat={onChat} onDiary={onDiary} onProgress={onProgress}/>
    <main className="page page--narrow meal-photo-page">
      <PageHeader title="Foto do prato" description="Fotografe a refeição e revise a estimativa antes de registrar."/>

      {premium === null && !premiumCheckError ? <Surface className="meal-photo-access-state"><LoadingState label="Verificando seu acesso Premium" description="Preparando a Foto do Prato com segurança."/></Surface> : premiumCheckError ? <Alert variant="error" title="Não foi possível verificar sua assinatura"><span>Tente novamente antes de enviar uma foto.</span><Button variant="ghost" onClick={() => { setPremium(null); setPremiumCheckError(false); setPremiumCheckKey((value) => value + 1) }}>Tentar novamente</Button></Alert> : premium === false ? <div className="meal-photo-locked"><Alert variant="info" title="Recurso exclusivo Premium">A Foto do Prato está disponível para assinantes Premium.</Alert><Paywall/></div> : <>
      <div className="mp-photo-feedback">
        {error && <Alert variant="error" title="Não foi possível continuar">{error}</Alert>}
        {confirmed && <Alert variant="success" title="Refeição registrada"><span>A confirmação foi salva com os dados revisados. A foto não foi armazenada.</span><Button className="mp-photo-diary-link" variant="ghost" onClick={onDiary}>Ver no Diário</Button></Alert>}
      </div>

      <section className="mp-photo-capture" aria-label="Foto da refeição">
        <label className="ui-visually-hidden" htmlFor="meal-photo-gallery">Escolher uma foto da galeria</label>
        <input id="meal-photo-gallery" ref={galleryInput} className="ui-visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Selecionar imagem do prato" onChange={choose}/>
        <label className="ui-visually-hidden" htmlFor="meal-photo-camera">Fotografar o prato com a câmera</label>
        <input id="meal-photo-camera" ref={cameraInput} className="ui-visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Fotografar o prato" onChange={choose}/>

        {!preview ? <PhotoPicker onGallery={() => galleryInput.current?.click()} onCamera={() => cameraInput.current?.click()}/> : <div className="mp-photo-preview-layout">
          <figure className="mp-photo-preview"><img src={preview} alt="Prévia da refeição selecionada"/></figure>
          <div className="mp-photo-preview__aside">
            <p>Se o prato estiver visível, já pode analisar. Nada é enviado automaticamente.</p>
            <Button fullWidth loading={analyzing} loadingLabel="Analisando sua refeição" onClick={() => void analyze()}>Analisar refeição</Button>
            <div className="mp-photo-actions"><Button variant="secondary" disabled={analyzing} onClick={() => galleryInput.current?.click()}>Trocar foto</Button><Button variant="ghost" disabled={analyzing} onClick={clearPhoto}>Remover foto</Button></div>
            {analyzing && <LoadingState className="mp-photo-analysis-loading" label="Analisando sua refeição…" description="Identificando alimentos e estimando as informações nutricionais, sem assumir precisão que a imagem não oferece."/>}
          </div>
        </div>}
        <p className="mp-photo-privacy">JPEG, PNG ou WebP até 5 MB. A imagem é usada só nesta análise e descartada depois; ela não integra o registro alimentar.</p>
      </section>

      {analysis && <AnalysisReview analysis={analysis} confirming={confirming} confirmed={Boolean(confirmed)} onChange={updateFood} onRemove={removeFood} onAdd={addFood} onConfirm={() => void confirm()}/>}
      </>}
    </main>
  </div>
}

function PhotoPicker({ onGallery, onCamera }: { onGallery(): void; onCamera(): void }) {
  return <div className="mp-photo-picker">
    <svg className="mp-photo-picker__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5Z"/><circle cx="12" cy="12.5" r="3.5"/></svg>
    <h2>Fotografe ou escolha seu prato</h2>
    <p>A análise só começa quando você confirmar.</p>
    <div className="mp-photo-actions"><Button onClick={onCamera}>Usar câmera</Button><Button variant="secondary" onClick={onGallery}>Escolher foto</Button></div>
    <ul className="mp-photo-tips" aria-label="Dicas para a foto"><li>Boa iluminação</li><li>Prato inteiro no quadro</li><li>Não fotografe de muito longe</li></ul>
  </div>
}

function AnalysisReview({ analysis, confirming, confirmed, onChange, onRemove, onAdd, onConfirm }: { analysis: MealPhotoAnalysis; confirming: boolean; confirmed: boolean; onChange(index: number, patch: Partial<MealPhotoFood>): void; onRemove(index: number): void; onAdd(): void; onConfirm(): void }) {
  return <section className="mp-photo-review" aria-labelledby="mp-photo-review-title">
    <div className="mp-photo-section-heading"><h2 id="mp-photo-review-title">Encontramos estes alimentos</h2><p>Revise nomes, porções e valores antes de registrar a refeição.</p></div>
    <Alert variant="warning" title="Esta análise é uma estimativa">A foto não garante peso, quantidade, ingredientes escondidos, óleos, molhos ou calorias exatas. Corrija os dados antes de registrar.</Alert>
    {analysis.observations.length > 0 && <Alert variant="info" title="Limitações observadas">{analysis.observations.join(' ')}</Alert>}
    {analysis.undeterminedItems.length > 0 && <Alert variant="info" title="Não foi possível determinar">{analysis.undeterminedItems.join(', ')}</Alert>}

    <div className="mp-photo-foods">
      {analysis.foods.length > 0 ? analysis.foods.map((food, index) => <FoodEditor key={index} food={food} index={index} onChange={onChange} onRemove={onRemove}/>) : <div className="mp-photo-foods__empty"><h3>Nenhum alimento confirmado</h3><p>Adicione manualmente ao menos um alimento para registrar esta refeição.</p></div>}
    </div>
    <Button className="mp-photo-add" variant="secondary" onClick={onAdd}>Adicionar alimento</Button>

    <div className="mp-photo-confirm"><p>Somente os dados acima serão registrados. Os valores continuam sendo estimativas.</p><Button loading={confirming} loadingLabel="Registrando refeição" disabled={confirmed} onClick={onConfirm}>{confirmed ? 'Refeição registrada' : 'Registrar refeição'}</Button></div>
  </section>
}

function FoodEditor({ food, index, onChange, onRemove }: { food: MealPhotoFood; index: number; onChange(index: number, patch: Partial<MealPhotoFood>): void; onRemove(index: number): void }) {
  const numeric: Array<[keyof Pick<MealPhotoFood, 'estimatedCaloriesKcal' | 'estimatedProteinGrams' | 'estimatedCarbohydrateGrams' | 'estimatedFatGrams'>, string]> = [
    ['estimatedCaloriesKcal', 'Calorias (kcal)'],
    ['estimatedProteinGrams', 'Proteína (g)'],
    ['estimatedCarbohydrateGrams', 'Carboidratos (g)'],
    ['estimatedFatGrams', 'Gorduras (g)'],
  ]
  return <article className="mp-photo-food">
    <header className="mp-photo-food__header"><div><h3>{food.name.trim() || `Alimento ${index + 1}`}</h3><Badge variant={confidenceVariants[food.confidence]}>Confiança: {confidenceLabels[food.confidence]}</Badge></div><Button variant="ghost" onClick={() => onRemove(index)}>Remover</Button></header>
    <div className="mp-photo-food__fields">
      <FormField id={`photo-food-${index}-name`} label="Nome do alimento" required className="mp-photo-food__wide">{(control) => <input {...control} value={food.name} maxLength={120} onChange={(event) => onChange(index, { name: event.target.value })}/>}</FormField>
      <FormField id={`photo-food-${index}-portion`} label="Porção estimada" required className="mp-photo-food__wide">{(control) => <input {...control} value={food.portionDescription} maxLength={240} onChange={(event) => onChange(index, { portionDescription: event.target.value })}/>}</FormField>
      {numeric.map(([field, label]) => <FormField id={`photo-food-${index}-${field}`} label={label} key={field}>{(control) => <input {...control} type="number" inputMode="decimal" min="0" step="0.1" value={food[field] ?? ''} placeholder="Não determinado" onChange={(event) => onChange(index, { [field]: nullableNumber(event.target.value) })}/>}</FormField>)}
      <FormField id={`photo-food-${index}-confidence`} label="Confiança da estimativa" className="mp-photo-food__wide">{(control) => <select {...control} value={food.confidence} onChange={(event) => onChange(index, { confidence: event.target.value as FoodEstimateConfidence })}>{Object.entries(confidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</FormField>
    </div>
    {food.limitations.length > 0 && <p className="mp-photo-food__limitations"><strong>Limitações:</strong> {food.limitations.join(' ')}</p>}
  </article>
}
