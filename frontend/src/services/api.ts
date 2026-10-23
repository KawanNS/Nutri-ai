import { AUTH_UNAUTHORIZED_EVENT, getToken, removeToken } from './authToken'
const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
export interface ApiErrorDetail { field: string; message: string }
interface ApiErrorBody { error?: string; code?: string; details?: ApiErrorDetail[] }
export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly details?: ApiErrorDetail[]
  constructor(message: string, status: number, code?: string, details?: ApiErrorDetail[]) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}
/**
 * The API sleeps when idle on the hosting plan and takes ~20-50 s to wake up.
 * Pinging it as soon as the site opens lets it wake while the visitor reads the
 * page or answers the questions, instead of when they ask for something.
 */
export function wakeApi(): void {
  fetch(`${API_URL}/health`, { cache: 'no-store' }).catch(() => { /* Only a warm-up; failures do not matter. */ })
}
/**
 * Retries a request while the failure looks like the API still waking up (network error or 5xx),
 * for up to ~1 minute. 4xx answers are real answers and return right away.
 */
export async function retryWhileWaking<T>(request: () => Promise<T>, retryDelayMs = 4000, giveUpAfterMs = 60_000): Promise<T> {
  const started = Date.now()
  for (;;) {
    try {
      return await request()
    } catch (error) {
      const transient = !(error instanceof ApiError) || error.status >= 500
      if (!transient || Date.now() - started + retryDelayMs > giveUpAfterMs) throw error
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }
  }
}
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_URL}${path}`, { ...init, headers })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody
    if (response.status === 401 && token) {
      removeToken()
      window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT))
    }
    throw new ApiError(body.error ?? 'Não foi possível concluir a solicitação.', response.status, body.code, body.details)
  }
  return response.json() as Promise<T>
}
