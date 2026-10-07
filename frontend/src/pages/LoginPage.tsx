import { useState, type FormEvent } from 'react'
import { AuthLayout } from '../components/AuthLayout'
import { PasswordField } from '../components/auth/PasswordField'
import { GoogleSignInButton } from '../components/auth/GoogleSignInButton'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { FormField } from '../components/ui/FormField'
import { ApiError } from '../services/api'
import { login, loginWithGoogle } from '../services/authService'
import { saveRole, saveToken } from '../services/authToken'

interface LoginPageProps { initialEmail?: string; notice?: string; onAuthenticated(role: 'USER' | 'ADMIN'): void; onRegister(): void; onHome(): void }

export function LoginPage({ initialEmail = '', notice, onAuthenticated, onRegister, onHome }: LoginPageProps) {
  const [email, setEmail] = useState(initialEmail), [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false), [error, setError] = useState<string | null>(null)
  async function handleGoogleCredential(credential: string) {
    if (submitting) return
    setSubmitting(true); setError(null)
    try { const response = await loginWithGoogle(credential); saveToken(response.token); saveRole(response.user.role); onAuthenticated(response.user.role) }
    catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'LOCAL_ACCOUNT_EXISTS') setError('Já existe uma conta com este e-mail. Entre com seu e-mail e senha.')
      else if (requestError instanceof ApiError && requestError.code === 'GOOGLE_EMAIL_NOT_VERIFIED') setError('Seu e-mail do Google ainda não foi verificado.')
      else if (requestError instanceof ApiError && requestError.code === 'GOOGLE_CREDENTIAL_INVALID') setError('Sua sessão do Google é inválida ou expirou. Tente novamente.')
      else if (requestError instanceof TypeError) setError('Não foi possível conectar. Verifique sua internet e tente novamente.')
      else setError('Não foi possível entrar com Google agora. Tente novamente.')
    }
    finally { setSubmitting(false) }
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting) return
    setSubmitting(true); setError(null)
    try { const response = await login({ email: email.trim(), password }); saveToken(response.token); saveRole(response.user.role); onAuthenticated(response.user.role) }
    catch (requestError) { setError(requestError instanceof ApiError && requestError.status === 401 ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar agora. Tente novamente.') }
    finally { setSubmitting(false) }
  }
  return <AuthLayout
    eyebrow="Que bom ter você de volta"
    title="Entre na sua conta"
    description="Continue cuidando da sua alimentação de forma simples e personalizada."
    visualTitle="Sua rotina continua daqui."
    visualDescription="Seu plano, seus registros e sua evolução reunidos em uma experiência leve para o dia a dia."
    onHome={onHome}
  >
    <div className="auth-shell__alerts">
      {notice && <Alert variant="success">{notice}</Alert>}
      {error && <Alert id="login-form-error" variant="error">{error}</Alert>}
    </div>
    <form className="auth-shell__form" onSubmit={(event) => void handleSubmit(event)}>
      <FormField id="login-email" label="E-mail" required>
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
          aria-describedby={[controlProps['aria-describedby'], error ? 'login-form-error' : undefined].filter(Boolean).join(' ') || undefined}
        />}
      </FormField>
      <PasswordField
        id="login-password"
        value={password}
        autoComplete="current-password"
        maxLength={128}
        required
        invalid={Boolean(error)}
        describedBy={error ? 'login-form-error' : undefined}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Sua senha"
      />
      <Button type="submit" fullWidth loading={submitting} loadingLabel="Entrando">Entrar <span aria-hidden="true">→</span></Button>
    </form>
    <div className="auth-shell__separator"><span>ou</span></div>
    <GoogleSignInButton disabled={submitting} onCredential={(credential) => void handleGoogleCredential(credential)} onError={setError}/>
    <div className="auth-shell__switch">
      <p>Ainda não tem conta? <button type="button" onClick={onRegister}>Criar conta</button></p>
      <button className="auth-shell__back" type="button" onClick={onHome}><span aria-hidden="true">←</span> Voltar para o início</button>
    </div>
  </AuthLayout>
}
