const TOKEN_KEY = 'nutri_ai_token'
export const AUTH_UNAUTHORIZED_EVENT = 'nutri-ai:unauthorized'
export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY) }
export function saveToken(token: string): void { localStorage.setItem(TOKEN_KEY, token) }
export function removeToken(): void { localStorage.removeItem(TOKEN_KEY) }
