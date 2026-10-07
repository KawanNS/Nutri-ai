import { useEffect, useRef, useState } from 'react'

interface GoogleCredentialResponse { credential?: string }
interface GoogleAccountsId {
  initialize(options: { client_id: string; callback(response: GoogleCredentialResponse): void; ux_mode: 'popup' }): void
  renderButton(element: HTMLElement, options: { type: 'standard'; theme: 'outline'; size: 'large'; text: 'continue_with'; shape: 'rectangular'; width: number; locale: string }): void
}

declare global {
  interface Window { google?: { accounts: { id: GoogleAccountsId } } }
}

const SCRIPT_ID = 'google-identity-services'
let googleScriptPromise: Promise<void> | null = null

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts.id) return Promise.resolve()
  if (googleScriptPromise) return googleScriptPromise

  const scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    const script = existing ?? document.createElement('script')
    const handleLoad = () => window.google?.accounts.id ? resolve() : reject(new Error('Google Identity Services unavailable'))
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

interface GoogleSignInButtonProps {
  disabled?: boolean
  onCredential(credential: string): void
  onError(message: string): void
}

export function GoogleSignInButton({ disabled = false, onCredential, onError }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
    if (!clientId) {
      onError('O login com Google está indisponível no momento.')
      return () => { active = false }
    }

    void loadGoogleIdentityServices().then(() => {
      if (!active || !containerRef.current || !window.google) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: 'popup',
        callback: ({ credential }) => {
          if (!credential) {
            onError('Não foi possível receber sua credencial do Google. Tente novamente.')
            return
          }
          onCredential(credential)
        },
      })
      containerRef.current.replaceChildren()
      window.google.accounts.id.renderButton(containerRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: Math.min(400, Math.max(200, Math.floor(containerRef.current.clientWidth))),
        locale: 'pt-BR',
      })
      setReady(true)
    }).catch(() => {
      if (active) onError('O Google está indisponível no momento. Tente novamente mais tarde.')
    })

    return () => { active = false }
  }, [onCredential, onError])

  return <div className={`google-sign-in${disabled ? ' google-sign-in--disabled' : ''}`} aria-busy={!ready}>
    <div ref={containerRef} className="google-sign-in__button" aria-label="Continuar com Google">
      {!ready && <span>Continuar com Google</span>}
    </div>
  </div>
}
