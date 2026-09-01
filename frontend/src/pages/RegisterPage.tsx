import { useState, type FormEvent } from 'react'
import { AuthLayout } from '../components/AuthLayout'
import { ApiError } from '../services/api'
import { register } from '../services/authService'

interface RegisterPageProps { onLogin(): void; onRegistered(email: string): void }

export function RegisterPage({ onLogin, onRegistered }: RegisterPageProps) {
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false), [error, setError] = useState<string | null>(null)
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting) return
    setSubmitting(true); setError(null)
    try { await register({ name: name.trim(), email: email.trim(), password }); onRegistered(email.trim()) }
    catch (requestError) { setError(requestError instanceof ApiError && requestError.status === 409 ? 'Este e-mail já está cadastrado.' : 'Não foi possível criar sua conta agora. Tente novamente.') }
    finally { setSubmitting(false) }
  }
  return <AuthLayout eyebrow="Comece agora" title="Crie sua conta" description="Preencha seus dados para começar a acompanhar sua evolução.">
    {error && <div className="notice notice--error" role="alert">{error}</div>}
    <form className="form auth-form" onSubmit={(event) => void handleSubmit(event)}>
      <div className="field"><label htmlFor="register-name">Nome</label><input id="register-name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome"/></div>
      <div className="field"><label htmlFor="register-email">E-mail</label><input id="register-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com"/></div>
      <div className="field"><label htmlFor="register-password">Senha</label><input id="register-password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Crie uma senha"/></div>
      <button className="button button--primary" type="submit" disabled={submitting}>{submitting ? 'Criando conta…' : 'Criar conta'}</button>
    </form>
    <p className="auth-switch">Já tem uma conta? <button type="button" onClick={onLogin}>Voltar para login</button></p>
  </AuthLayout>
}
