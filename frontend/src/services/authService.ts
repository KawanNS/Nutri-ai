import type { CurrentUserResponse, LoginInput, LoginResponse, RegisterInput, RegisterResponse } from '../types/auth'
import { apiRequest } from './api'

export function login(input: LoginInput): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input) })
}

export function register(input: RegisterInput): Promise<RegisterResponse> {
  return apiRequest<RegisterResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) })
}

export function loginWithGoogleCode(code: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/google/code', { method: 'POST', body: JSON.stringify({ code }) })
}

export function getCurrentUser(): Promise<CurrentUserResponse> {
  return apiRequest<CurrentUserResponse>('/auth/me')
}

/** Trades a still-valid token for a fresh one, so active users are not signed out. */
export function renewSession(): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/refresh', { method: 'POST' })
}
