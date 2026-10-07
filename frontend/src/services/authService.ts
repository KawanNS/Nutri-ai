import type { CurrentUserResponse, LoginInput, LoginResponse, RegisterInput, RegisterResponse } from '../types/auth'
import { apiRequest } from './api'

export function login(input: LoginInput): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input) })
}

export function register(input: RegisterInput): Promise<RegisterResponse> {
  return apiRequest<RegisterResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) })
}

export function loginWithGoogle(credential: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) })
}

export function getCurrentUser(): Promise<CurrentUserResponse> {
  return apiRequest<CurrentUserResponse>('/auth/me')
}
