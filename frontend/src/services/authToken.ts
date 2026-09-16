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
