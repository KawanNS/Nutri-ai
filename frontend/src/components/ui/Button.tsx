import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  loading?: boolean
  loadingLabel?: string
  fullWidth?: boolean
  children: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = 'primary',
  loading = false,
  loadingLabel = 'Carregando',
  fullWidth = false,
  className = '',
  disabled,
  type = 'button',
  children,
  ...props
}, ref) {
  const classes = [
    'ui-button',
    `ui-button--${variant}`,
    fullWidth ? 'ui-button--full' : '',
    className,
  ].filter(Boolean).join(' ')

  return <button
    {...props}
    ref={ref}
    className={classes}
    type={type}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
  >
    {loading && <span className="ui-button__spinner" aria-hidden="true"/>}
    <span className={loading ? 'ui-button__content ui-button__content--loading' : 'ui-button__content'}>{children}</span>
    {loading && <span className="ui-visually-hidden">{loadingLabel}</span>}
  </button>
})
