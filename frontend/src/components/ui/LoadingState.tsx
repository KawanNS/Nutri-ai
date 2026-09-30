interface LoadingStateProps {
  label: string
  description?: string
  className?: string
}

export function LoadingState({ label, description, className = '' }: LoadingStateProps) {
  return <div className={`ui-loading ${className}`.trim()} role="status" aria-live="polite">
    <span className="ui-loading__spinner" aria-hidden="true"/>
    <strong className="ui-loading__title">{label}</strong>
    {description && <p className="ui-loading__description">{description}</p>}
  </div>
}
