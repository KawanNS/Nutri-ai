import type { HTMLAttributes, ReactNode } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'success' | 'warning' | 'error'
  children: ReactNode
}

export function Badge({ variant = 'neutral', className = '', children, ...props }: BadgeProps) {
  return <span {...props} className={`ui-badge ui-badge--${variant} ${className}`.trim()}>{children}</span>
}
