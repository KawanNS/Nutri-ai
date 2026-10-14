import { useEffect, useRef, useState } from 'react'

interface GoogleCodeResponse { code?: string; state?: string; error?: string }
interface GoogleCodeClientError { type?: 'popup_failed_to_open' | 'popup_closed' | 'unknown' }
interface GoogleCodeClient { requestCode(): void }
interface GoogleAccountsOAuth2 {
  initCodeClient(options: {
    client_id: string
    scope: string
    ux_mode: 'popup'
    select_account: boolean
    state: string
    callback(response: GoogleCodeResponse): void
    error_callback(error: GoogleCodeClientError): void
  }): GoogleCodeClient
}

declare global {
  interface Window { google?: { accounts: { oauth2?: GoogleAccountsOAuth2 } } }
}

const SCRIPT_ID = 'google-identity-services'
const GOOGLE_SCOPES = 'openid email profile'
let googleScriptPromise: Promise<void> | null = null

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve()
  if (googleScriptPromise) return googleScriptPromise

  const scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    const script = existing ?? document.createElement('script')
    const handleLoad = () => window.google?.accounts.oauth2 ? resolve() : reject(new Error('Google Identity Services unavailable'))
    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', () => {
      script.remove()
      reject(new Error('Google Identity Services unavailable'))
    }, { once: true })
    if (!existing) {
      script.id = SCRIPT_ID
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  }).catch((error: unknown) => {
    googleScriptPromise = null
    throw error
  })
  googleScriptPromise = scriptPromise
  return scriptPromise
}

function createState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

interface GoogleSignInButtonProps {
  disabled?: boolean
  onCode(code: string): void
  onError(message: string): void
}

export function GoogleSignInButton({ disabled = false, onCode, onError }: GoogleSignInButtonProps) {
  const codeCallbackRef = useRef(onCode)
  const errorCallbackRef = useRef(onError)
  const [ready, setReady] = useState(false)

  useEffect(() => { codeCallbackRef.current = onCode }, [onCode])
  useEffect(() => { errorCallbackRef.current = onError }, [onError])

  useEffect(() => {
    let active = true
    if (!import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()) {
      errorCallbackRef.current('O login com Google está indisponível no momento.')
      return () => { active = false }
    }

    void loadGoogleIdentityServices().then(() => {
      if (active) setReady(true)
    }).catch(() => {
      if (active) errorCallbackRef.current('O Google está indisponível no momento. Tente novamente mais tarde.')
    })

    return () => { active = false }
  }, [])

  function handleClick() {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
    const oauth2 = window.google?.accounts.oauth2
    if (!clientId || !oauth2) return

    // A fresh state per attempt ties the popup response to this click.
    const expectedState = createState()
    const client = oauth2.initCodeClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES,
      ux_mode: 'popup',
      select_account: true,
      state: expectedState,
      callback: ({ code, state, error }) => {
        if (error === 'access_denied') return
        if (error || !code || state !== expectedState) {
          errorCallbackRef.current('Não foi possível receber a autorização do Google. Tente novamente.')
          return
        }
        codeCallbackRef.current(code)
      },
      error_callback: ({ type }) => {
        if (type === 'popup_closed') return
        if (type === 'popup_failed_to_open') errorCallbackRef.current('Permita pop-ups neste site para continuar com Google.')
        else errorCallbackRef.current('O Google está indisponível no momento. Tente novamente mais tarde.')
      },
    })
    client.requestCode()
  }

  return <button className="google-sign-in" type="button" disabled={disabled || !ready} aria-busy={!ready} onClick={handleClick}>
    <svg className="google-sign-in__logo" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
    <span className="google-sign-in__label">Continuar com Google</span>
  </button>
}
