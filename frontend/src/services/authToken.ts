const TOKEN_KEY = 'nutri_ai_token'
const ROLE_KEY = 'nutri_ai_role'
export const AUTH_UNAUTHORIZED_EVENT = 'nutri-ai:unauthorized'
export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY) }
export function saveToken(token: string): void { localStorage.setItem(TOKEN_KEY, token) }
export function getRole(): 'USER' | 'ADMIN' | null {
  const role = localStorage.getItem(ROLE_KEY)
  return role === 'USER' || role === 'ADMIN' ? role : null
}
export function saveRole(role: 'USER' | 'ADMIN'): void { localStorage.setItem(ROLE_KEY, role) }
export function removeToken(): void { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ROLE_KEY) }

/** When the token was issued (ms), read from its payload; null if it cannot be read. */
export function tokenIssuedAt(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { iat?: unknown }
    return typeof payload.iat === 'number' ? payload.iat * 1000 : null
  } catch {
    return null
  }
}
