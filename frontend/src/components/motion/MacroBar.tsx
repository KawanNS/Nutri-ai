import type { CSSProperties } from 'react'
import './MacroBar.css'

interface MacroBarProps {
  proteinGrams: number | null
  carbohydrateGrams: number | null
  fatGrams: number | null
  className?: string
  legend?: boolean
}

const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/**
 * Where the day's calories come from: protein and carbohydrate count 4 kcal per gram, fat 9. The bar fills
 * from the left once when it appears; the shares are also written out in the legend.
 */
export function MacroBar({ proteinGrams, carbohydrateGrams, fatGrams, className = '', legend = true }: MacroBarProps) {
  if (proteinGrams === null || carbohydrateGrams === null || fatGrams === null) return null
  const parts = [
    { key: 'protein', label: 'Proteína', kcal: proteinGrams * 4 },
    { key: 'carbohydrate', label: 'Carboidrato', kcal: carbohydrateGrams * 4 },
    { key: 'fat', label: 'Gordura', kcal: fatGrams * 9 },
  ]
  const total = parts.reduce((sum, part) => sum + part.kcal, 0)
  if (total <= 0) return null

  const summary = parts.map((part) => `${part.label} ${percent.format((part.kcal / total) * 100)}%`).join(', ')
  return <div className={`macro-bar ${className}`.trim()}>
    <div className="macro-bar__track" role="img" aria-label={legend ? undefined : `De onde vêm as calorias: ${summary}`} aria-hidden={legend || undefined}>
      <div className="macro-bar__fill">
        {parts.map((part) => <i key={part.key} className={`macro-bar__part macro-bar__part--${part.key}`} style={{ '--share': part.kcal / total } as CSSProperties}/>)}
      </div>
    </div>
    {legend && <ul className="macro-bar__legend" aria-label="De onde vêm as calorias">
      {parts.map((part) => <li key={part.key}><span className={`macro-bar__dot macro-bar__part--${part.key}`} aria-hidden="true"/>{part.label} <strong>{percent.format((part.kcal / total) * 100)}%</strong></li>)}
    </ul>}
  </div>
}
