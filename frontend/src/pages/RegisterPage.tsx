import { useState, type FormEvent } from 'react'
import { AuthLayout } from '../components/AuthLayout'
import { PasswordField } from '../components/auth/PasswordField'
import { GoogleSignInButton } from '../components/auth/GoogleSignInButton'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { FormField } from '../components/ui/FormField'
import { ApiError } from '../services/api'
import { login, loginWithGoogleCode, register } from '../services/authService'
import { saveRole, saveToken } from '../services/authToken'

interface RegisterPageProps { onLogin(): void; onRegistered(email: string): void; onAuthenticated(role: 'USER' | 'ADMIN'): void; onHome(): void }

export function RegisterPage({ onLogin, onRegistered, onAuthenticated, onHome }: RegisterPageProps) {
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false), [error, setError] = useState<string | null>(null)
  async function handleGoogleCode(code: string) {
    if (submitting) return
    setSubmitting(true); setError(null)
    try { const response = await loginWithGoogleCode(code); saveToken(response.token); saveRole(response.user.role); onAuthenticated(response.user.role) }
    catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'LOCAL_ACCOUNT_EXISTS') setError('Já existe uma conta com este e-mail. Entre pelo método usado na criação da conta.')
      else if (requestError instanceof ApiError && requestError.code === 'GOOGLE_EMAIL_NOT_VERIFIED') setError('Seu e-mail do Google ainda não foi verificado.')
      else if (requestError instanceof ApiError && requestError.code === 'GOOGLE_AUDIENCE_MISMATCH') setError('Não foi possível validar o Google devido a uma inconsistência de configuração.')
      else if (requestError instanceof ApiError && requestError.code === 'GOOGLE_CREDENTIAL_EXPIRED') setError('Sua sessão do Google expirou. Abra o Google novamente para continuar.')
      else if (requestError instanceof ApiError && requestError.code === 'GOOGLE_UNAVAILABLE') setError('O Google está indisponível no momento. Tente novamente mais tarde.')
      else if (requestError instanceof ApiError && requestError.code === 'GOOGLE_CODE_INVALID') setError('A autorização do Google expirou ou já foi usada. Tente novamente.')
      else if (requestError instanceof ApiError && requestError.code === 'GOOGLE_CODE_FLOW_UNAVAILABLE') setError('O login com Google está indisponível no momento. Tente novamente mais tarde.')
      else if (requestError instanceof ApiError && requestError.status === 400) setError('O Google não retornou uma credencial válida. Tente abrir o login novamente.')
      else if (requestError instanceof ApiError && requestError.code === 'GOOGLE_CREDENTIAL_INVALID') setError('Sua sessão do Google é inválida ou expirou. Tente novamente.')
      else if (requestError instanceof ApiError && requestError.status >= 500) setError('O login está temporariamente indisponível. Tente novamente mais tarde.')
      else if (requestError instanceof TypeError) setError('Não foi possível conectar. Verifique sua internet e tente novamente.')
      else setError('Não foi possível continuar com Google agora. Tente novamente.')
    }
    finally { setSubmitting(false) }
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting) return
    setSubmitting(true); setError(null)
    try { await register({ name: name.trim(), email: email.trim(), password }) }
    catch (requestError) {
      setError(requestError instanceof ApiError && requestError.status === 409 ? 'Este e-mail já está cadastrado.' : 'Não foi possível criar sua conta agora. Tente novamente.')
      setSubmitting(false); return
    }
    // Straight into the app with the password just typed; only if that fails, the login screen asks again.
    try { const response = await login({ email: email.trim(), password }); saveToken(response.token); saveRole(response.user.role); onAuthenticated(response.user.role) }
    catch { onRegistered(email.trim()) }
    finally { setSubmitting(false) }
  }
  return <AuthLayout
    eyebrow="Comece no seu ritmo"
    title="Crie sua conta"
    description="Só precisamos dos dados essenciais para você continuar sua jornada na Alyvora."
    visualTitle="Um começo simples para organizar sua alimentação."
    visualDescription="Transforme suas preferências e sua rotina em um plano fácil de consultar e acompanhar."
    onHome={onHome}
  >
    <div className="auth-shell__alerts">
      {error && <Alert id="register-form-error" variant="error">{error}</Alert>}
    </div>
    <form className="auth-shell__form" onSubmit={(event) => void handleSubmit(event)}>
      <FormField id="register-name" label="Nome" required>
        {(controlProps) => <input
          {...controlProps}
          autoComplete="name"
          minLength={2}
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Seu nome"
          aria-invalid={error ? true : undefined}
          aria-describedby={[controlProps['aria-describedby'], error ? 'register-form-error' : undefined].filter(Boolean).join(' ') || undefined}
        />}
      </FormField>
      <FormField id="register-email" label="E-mail" required>
        {(controlProps) => <input
          {...controlProps}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="voce@exemplo.com"
          aria-invalid={error ? true : undefined}
          aria-describedby={[controlProps['aria-describedby'], error ? 'register-form-error' : undefined].filter(Boolean).join(' ') || undefined}
        />}
      </FormField>
      <PasswordField
        id="register-password"
        value={password}
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        required
        invalid={Boolean(error)}
        describedBy={error ? 'register-form-error' : undefined}
        hint="Use pelo menos 8 caracteres."
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Crie uma senha"
      />
      <Button type="submit" fullWidth loading={submitting} loadingLabel="Criando conta">Criar conta <span aria-hidden="true">→</span></Button>
    </form>
    <div className="auth-shell__separator"><span>ou</span></div>
    <GoogleSignInButton disabled={submitting} onCode={(code) => void handleGoogleCode(code)} onError={setError}/>
    <div className="auth-shell__switch">
      <p>Já tem uma conta? <button type="button" onClick={onLogin}>Entrar</button></p>
      <button className="auth-shell__back" type="button" onClick={onHome}><span aria-hidden="true">←</span> Voltar para o início</button>
    </div>
  </AuthLayout>
}
