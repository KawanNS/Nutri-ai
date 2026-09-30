import type { HTMLAttributes, ReactNode } from 'react'

type AlertVariant = 'success' | 'warning' | 'error' | 'info'

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant: AlertVariant
  title?: string
  children: ReactNode
}

const marks: Record<AlertVariant, string> = {
  success: '✓',
  warning: '!',
  error: '×',
  info: 'i',
}

export function Alert({ variant, title, className = '', role, children, ...props }: AlertProps) {
  return <div
    {...props}
    className={`ui-alert ui-alert--${variant} ${className}`.trim()}
    role={role ?? (variant === 'error' ? 'alert' : 'status')}
  >
    <span className="ui-alert__mark" aria-hidden="true">{marks[variant]}</span>
    <div className="ui-alert__content">
      {title && <strong className="ui-alert__title">{title}</strong>}
      <div>{children}</div>
    </div>
  </div>
}
