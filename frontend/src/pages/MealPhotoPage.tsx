import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { DiaryNavButton } from '../components/DiaryNavButton'
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

export function MealPhotoPage({ onMealPlan, onChat, onDiary, onProfile, onProgress, onLogout }: MealPhotoPageProps) {
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
    <header className="topbar"><div className="topbar__content"><div className="brand"><BrandLogo/></div><nav className="topbar__actions" aria-label="Navegação principal"><button className="nav-button" onClick={onMealPlan}>Plano alimentar</button><button className="nav-button" onClick={onChat}>Assistente</button><button className="nav-button nav-button--active" aria-current="page">Foto do prato</button><DiaryNavButton onClick={onDiary}/><button className="nav-button" onClick={onProfile}>Perfil</button><button className="nav-button" onClick={onProgress}>Evolução</button><button className="logout-button" onClick={onLogout}>Sair</button></nav></div></header>
    <main className="page meal-photo-page">
      <PageHeader eyebrow="Registro alimentar" title="Foto do prato" description="Envie uma foto da sua refeição para identificar os alimentos e estimar as informações nutricionais. Você revisa tudo antes de registrar."/>

      {premium === null && !premiumCheckError ? <Surface className="meal-photo-access-state"><LoadingState label="Verificando seu acesso Premium" description="Preparando a Foto do Prato com segurança."/></Surface> : premiumCheckError ? <Alert variant="error" title="Não foi possível verificar sua assinatura"><span>Tente novamente antes de enviar uma foto.</span><Button variant="ghost" onClick={() => { setPremium(null); setPremiumCheckError(false); setPremiumCheckKey((value) => value + 1) }}>Tentar novamente</Button></Alert> : premium === false ? <div className="meal-photo-locked"><Alert variant="info" title="Recurso exclusivo Premium">A Foto do Prato está disponível para assinantes Premium.</Alert><Paywall/></div> : <>
      <div className="mp-photo-feedback">
        {error && <Alert variant="error" title="Não foi possível continuar">{error}</Alert>}
        {confirmed && <Alert variant="success" title="Refeição registrada"><span>A confirmação foi salva com os dados revisados. A foto não foi armazenada.</span><Button className="mp-photo-diary-link" variant="ghost" onClick={onDiary}>Ver no Diário</Button></Alert>}
      </div>

      <Surface as="section" className="mp-photo-capture" level="base" aria-labelledby="mp-photo-capture-title">
        <header className="mp-photo-capture__header"><div><p className="mp-photo-kicker">1. Adicione a imagem</p><h2 id="mp-photo-capture-title">Mostre sua refeição</h2></div><Badge>JPEG, PNG ou WebP · até 5 MB</Badge></header>
        <label className="ui-visually-hidden" htmlFor="meal-photo-gallery">Escolher uma foto da galeria</label>
        <input id="meal-photo-gallery" ref={galleryInput} className="ui-visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Selecionar imagem do prato" onChange={choose}/>
        <label className="ui-visually-hidden" htmlFor="meal-photo-camera">Fotografar o prato com a câmera</label>
        <input id="meal-photo-camera" ref={cameraInput} className="ui-visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Fotografar o prato" onChange={choose}/>

        {!preview ? <PhotoPicker onGallery={() => galleryInput.current?.click()} onCamera={() => cameraInput.current?.click()}/> : <div className="mp-photo-preview-layout">
          <figure className="mp-photo-preview"><img src={preview} alt="Prévia da refeição selecionada"/><figcaption>Sua foto será usada somente nesta análise.</figcaption></figure>
          <div className="mp-photo-preview__aside">
            <div><p className="mp-photo-kicker">Foto pronta</p><h3>Confira o enquadramento</h3><p>Se o prato estiver visível, você já pode iniciar a análise. Nada é enviado automaticamente.</p></div>
            <div className="mp-photo-actions"><Button variant="secondary" disabled={analyzing} onClick={() => galleryInput.current?.click()}>Trocar foto</Button><Button variant="ghost" disabled={analyzing} onClick={clearPhoto}>Remover foto</Button><Button loading={analyzing} loadingLabel="Analisando sua refeição" onClick={() => void analyze()}>Analisar refeição</Button></div>
            {analyzing && <LoadingState className="mp-photo-analysis-loading" label="Analisando sua refeição…" description="Identificando alimentos e estimando as informações nutricionais, sem assumir precisão que a imagem não oferece."/>}
          </div>
        </div>}
        <p className="mp-photo-privacy">A imagem é enviada somente para análise e descartada depois. Ela não integra o registro alimentar.</p>
      </Surface>

      {analysis && <AnalysisReview analysis={analysis} confirming={confirming} confirmed={Boolean(confirmed)} onChange={updateFood} onRemove={removeFood} onAdd={addFood} onConfirm={() => void confirm()}/>}
      </>}
    </main>
  </div>
}

function PhotoPicker({ onGallery, onCamera }: { onGallery(): void; onCamera(): void }) {
  return <div className="mp-photo-picker">
    <span className="mp-photo-picker__camera" aria-hidden="true"><i/></span>
    <div><h3>Fotografe ou escolha seu prato</h3><p>A análise só começa quando você confirmar.</p></div>
    <div className="mp-photo-actions"><Button onClick={onCamera}>Usar câmera</Button><Button variant="secondary" onClick={onGallery}>Escolher foto</Button></div>
    <ul className="mp-photo-tips" aria-label="Dicas para a foto"><li><span aria-hidden="true">01</span>Use boa iluminação</li><li><span aria-hidden="true">02</span>Mostre o prato inteiro</li><li><span aria-hidden="true">03</span>Evite fotografar de muito longe</li></ul>
  </div>
}

function AnalysisReview({ analysis, confirming, confirmed, onChange, onRemove, onAdd, onConfirm }: { analysis: MealPhotoAnalysis; confirming: boolean; confirmed: boolean; onChange(index: number, patch: Partial<MealPhotoFood>): void; onRemove(index: number): void; onAdd(): void; onConfirm(): void }) {
  return <section className="mp-photo-review" aria-labelledby="mp-photo-review-title">
    <div className="mp-photo-section-heading"><div><p className="mp-photo-kicker">2. Confira a estimativa</p><h2 id="mp-photo-review-title">Encontramos estes alimentos</h2></div><p>Revise nomes, porções e valores antes de registrar a refeição.</p></div>
    <Alert variant="warning" title="Esta análise é uma estimativa">A foto não garante peso, quantidade, ingredientes escondidos, óleos, molhos ou calorias exatas. Corrija os dados antes de registrar.</Alert>
    {analysis.observations.length > 0 && <Alert variant="info" title="Limitações observadas">{analysis.observations.join(' ')}</Alert>}
    {analysis.undeterminedItems.length > 0 && <Alert variant="info" title="Não foi possível determinar">{analysis.undeterminedItems.join(', ')}</Alert>}

    <Surface className="mp-photo-foods" level="base" padded={false}>
      {analysis.foods.length > 0 ? analysis.foods.map((food, index) => <FoodEditor key={index} food={food} index={index} onChange={onChange} onRemove={onRemove}/>) : <div className="mp-photo-foods__empty"><h3>Nenhum alimento confirmado</h3><p>Adicione manualmente ao menos um alimento para registrar esta refeição.</p></div>}
    </Surface>
    <Button className="mp-photo-add" variant="secondary" onClick={onAdd}>Adicionar alimento</Button>

    <Surface className="mp-photo-confirm" level="soft"><div><p className="mp-photo-kicker">3. Confirme o registro</p><h2>Revise antes de salvar</h2><p>Somente os dados acima serão registrados. Os valores continuam sendo estimativas.</p></div><Button loading={confirming} loadingLabel="Registrando refeição" disabled={confirmed} onClick={onConfirm}>{confirmed ? 'Refeição registrada' : 'Registrar refeição'}</Button></Surface>
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
    <header className="mp-photo-food__header"><div><span>Alimento {String(index + 1).padStart(2, '0')}</span><Badge variant={confidenceVariants[food.confidence]}>Confiança: {confidenceLabels[food.confidence]}</Badge></div><Button variant="ghost" onClick={() => onRemove(index)}>Remover</Button></header>
    <div className="mp-photo-food__fields">
      <FormField id={`photo-food-${index}-name`} label="Nome do alimento" required className="mp-photo-food__wide">{(control) => <input {...control} value={food.name} maxLength={120} onChange={(event) => onChange(index, { name: event.target.value })}/>}</FormField>
      <FormField id={`photo-food-${index}-portion`} label="Porção estimada" required className="mp-photo-food__wide">{(control) => <input {...control} value={food.portionDescription} maxLength={240} onChange={(event) => onChange(index, { portionDescription: event.target.value })}/>}</FormField>
      {numeric.map(([field, label]) => <FormField id={`photo-food-${index}-${field}`} label={label} key={field}>{(control) => <input {...control} type="number" inputMode="decimal" min="0" step="0.1" value={food[field] ?? ''} placeholder="Não determinado" onChange={(event) => onChange(index, { [field]: nullableNumber(event.target.value) })}/>}</FormField>)}
      <FormField id={`photo-food-${index}-confidence`} label="Confiança da estimativa">{(control) => <select {...control} value={food.confidence} onChange={(event) => onChange(index, { confidence: event.target.value as FoodEstimateConfidence })}>{Object.entries(confidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</FormField>
    </div>
    {food.limitations.length > 0 && <p className="mp-photo-food__limitations"><strong>Limitações:</strong> {food.limitations.join(' ')}</p>}
  </article>
}
