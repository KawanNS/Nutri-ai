import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

// Inside the app the header names the screen and offers its main action: no label above it, no display type.
export function PageHeader({ title, description, actions, className = '' }: PageHeaderProps) {
  return <header className={`ui-page-header ${className}`.trim()}>
    <div className="ui-page-header__content">
      <h1 className="ui-page-header__title">{title}</h1>
      {description && <p className="ui-page-header__description">{description}</p>}
    </div>
    {actions && <div className="ui-page-header__actions">{actions}</div>}
  </header>
}
