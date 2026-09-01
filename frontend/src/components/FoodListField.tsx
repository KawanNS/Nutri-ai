import { useState } from 'react'

interface FoodListFieldProps {
  id: string
  label: string
  items: string[]
  onChange(items: string[]): void
  conflictsWith?: string[]
}

export function FoodListField({ id, label, items, onChange, conflictsWith = [] }: FoodListFieldProps) {
  const [value, setValue] = useState(''), [error, setError] = useState<string | null>(null)
  function addItem() {
    const item = value.trim(), normalized = item.toLocaleLowerCase('pt-BR')
    if (!item) { setError('Digite um alimento antes de adicionar.'); return }
    if (item.length > 80) { setError('Use no máximo 80 caracteres.'); return }
    if (items.length >= 30) { setError('O limite é de 30 itens.'); return }
    if (items.some((existing) => existing.toLocaleLowerCase('pt-BR') === normalized)) { setError('Este item já foi adicionado.'); return }
    if (conflictsWith.some((existing) => existing.toLocaleLowerCase('pt-BR') === normalized)) { setError('Este alimento está em uma lista incompatível.'); return }
    onChange([...items, item]); setValue(''); setError(null)
  }
  return <div className="food-field">
    <label htmlFor={id}>{label}</label>
    <div className="food-field__input"><input id={id} maxLength={80} value={value} onChange={(event) => { setValue(event.target.value); setError(null) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addItem() } }} placeholder="Digite um alimento"/><button type="button" onClick={addItem}>Adicionar</button></div>
    {error && <span className="field-error" role="alert">{error}</span>}
    {items.length > 0 && <ul className="chips" aria-label={`${label}: itens adicionados`}>{items.map((item) => <li key={item.toLocaleLowerCase('pt-BR')}><span>{item}</span><button type="button" aria-label={`Remover ${item}`} onClick={() => onChange(items.filter((current) => current !== item))}>×</button></li>)}</ul>}
    <span className="field__hint">{items.length}/30 itens</span>
  </div>
}
