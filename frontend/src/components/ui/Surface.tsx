import type { HTMLAttributes, ReactNode } from 'react'

type SurfaceElement = 'div' | 'section' | 'article' | 'aside'

interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: SurfaceElement
  level?: 'base' | 'soft' | 'raised'
  padded?: boolean
  children: ReactNode
}

export function Surface({ as: Component = 'div', level = 'base', padded = true, className = '', children, ...props }: SurfaceProps) {
  const classes = [
    'ui-surface',
    `ui-surface--${level}`,
    padded ? 'ui-surface--padded' : '',
    className,
  ].filter(Boolean).join(' ')

  return <Component {...props} className={classes}>{children}</Component>
}
