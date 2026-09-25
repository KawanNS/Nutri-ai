import logoUrl from '../assets/brand/nutri-ai-logo.png'
import symbolUrl from '../assets/brand/nutri-ai-symbol.png'

interface BrandLogoProps {
  variant?: 'full' | 'symbol'
  className?: string
}

export function BrandLogo({ variant = 'full', className = '' }: BrandLogoProps) {
  const source = variant === 'symbol' ? symbolUrl : logoUrl
  const label = variant === 'symbol' ? 'Nutri-AI' : 'Nutri-AI — Nutrição com IA'
  return <img className={`brand-logo brand-logo--${variant} ${className}`.trim()} src={source} alt={label} draggable="false"/>
}
