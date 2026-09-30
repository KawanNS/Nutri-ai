import type { ReactNode } from 'react'

export interface FormFieldControlProps {
  id: string
  required?: boolean
  'aria-describedby'?: string
  'aria-invalid'?: true
}

interface FormFieldProps {
  id: string
  label: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children(controlProps: FormFieldControlProps): ReactNode
}

export function FormField({ id, label, hint, error, required = false, className = '', children }: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return <div className={`ui-field ${className}`.trim()}>
    <label className="ui-field__label" htmlFor={id}>
      {label}
      {required && <><span className="ui-field__required" aria-hidden="true"> *</span><span className="ui-visually-hidden"> (obrigatório)</span></>}
    </label>
    {children({
      id,
      required: required || undefined,
      'aria-describedby': describedBy,
      'aria-invalid': error ? true : undefined,
    })}
    {hint && <span className="ui-field__hint" id={hintId}>{hint}</span>}
    {error && <span className="ui-field__error" id={errorId}>
      <span className="ui-field__error-mark" aria-hidden="true">!</span>
      <span>{error}</span>
    </span>}
  </div>
}
