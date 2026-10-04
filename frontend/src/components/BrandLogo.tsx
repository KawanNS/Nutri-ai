import alyvoraLogoHorizontal from '../assets/alyvora/alyvora-logo-horizontal.png'

interface BrandLogoProps {
  variant?: 'full' | 'symbol'
  className?: string
}

export function BrandLogo({ variant = 'full', className = '' }: BrandLogoProps) {
  return <img
    className={`brand-logo brand-logo--${variant} ${className}`.trim()}
    src={alyvoraLogoHorizontal}
    alt="Alyvora"
    width={2172}
    height={724}
    draggable="false"
  />
}
