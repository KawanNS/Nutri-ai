import { AUTH_UNAUTHORIZED_EVENT, getToken, removeToken } from './authToken'
const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
interface ApiErrorBody { error?: string; code?: string }
export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_URL}${path}`, { ...init, headers })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody
    if (response.status === 401 && token) {
      removeToken()
      window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT))
    }
    throw new ApiError(body.error ?? 'Não foi possível concluir a solicitação.', response.status, body.code)
  }
  return response.json() as Promise<T>
}
