import type { LoginInput, LoginResponse, RegisterInput, RegisterResponse } from '../types/auth'
import { apiRequest } from './api'

export function login(input: LoginInput): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input) })
}

export function register(input: RegisterInput): Promise<RegisterResponse> {
  return apiRequest<RegisterResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) })
}
