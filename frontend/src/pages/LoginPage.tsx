import { useState, type FormEvent } from 'react'
import { AuthLayout } from '../components/AuthLayout'
import { ApiError } from '../services/api'
import { login } from '../services/authService'
import { saveRole, saveToken } from '../services/authToken'

interface LoginPageProps { initialEmail?: string; notice?: string; onAuthenticated(role: 'USER' | 'ADMIN'): void; onRegister(): void }

export function LoginPage({ initialEmail = '', notice, onAuthenticated, onRegister }: LoginPageProps) {
  const [email, setEmail] = useState(initialEmail), [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false), [error, setError] = useState<string | null>(null)
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting) return
    setSubmitting(true); setError(null)
    try { const response = await login({ email: email.trim(), password }); saveToken(response.token); saveRole(response.user.role); onAuthenticated(response.user.role) }
    catch (requestError) { setError(requestError instanceof ApiError && requestError.status === 401 ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar agora. Tente novamente.') }
    finally { setSubmitting(false) }
  }
  return <AuthLayout eyebrow="Boas-vindas" title="Entre na sua conta" description="Use seus dados para acessar seu histórico.">
    {notice && <div className="notice notice--success" role="status">{notice}</div>}{error && <div className="notice notice--error" role="alert">{error}</div>}
    <form className="form auth-form" onSubmit={(event) => void handleSubmit(event)}>
      <div className="field"><label htmlFor="login-email">E-mail</label><input id="login-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com"/></div>
      <div className="field"><label htmlFor="login-password">Senha</label><input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha"/></div>
      <button className="button button--primary" type="submit" disabled={submitting}>{submitting ? 'Entrando…' : 'Entrar'}</button>
    </form>
    <p className="auth-switch">Ainda não tem conta? <button type="button" onClick={onRegister}>Cadastre-se</button></p>
  </AuthLayout>
}
