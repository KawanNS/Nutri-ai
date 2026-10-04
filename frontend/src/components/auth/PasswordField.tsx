import { useState, type ChangeEvent } from 'react'
import { FormField } from '../ui/FormField'

interface PasswordFieldProps {
  id: string
  label?: string
  value: string
  autoComplete: 'current-password' | 'new-password'
  placeholder: string
  minLength?: number
  maxLength: number
  required?: boolean
  invalid?: boolean
  describedBy?: string
  hint?: string
  onChange(event: ChangeEvent<HTMLInputElement>): void
}

export function PasswordField({
  id,
  label = 'Senha',
  value,
  autoComplete,
  placeholder,
  minLength,
  maxLength,
  required = false,
  invalid = false,
  describedBy,
  hint,
  onChange,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)

  return <FormField id={id} label={label} hint={hint} required={required}>
    {(controlProps) => <div className="auth-password">
      <input
        {...controlProps}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={maxLength}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={[controlProps['aria-describedby'], describedBy].filter(Boolean).join(' ') || undefined}
      />
      <button
        type="button"
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/>
          <circle cx="12" cy="12" r="2.5"/>
          {!visible && <path d="m4 4 16 16"/>}
        </svg>
      </button>
    </div>}
  </FormField>
}
