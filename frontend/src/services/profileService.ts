import type { ProfilePayload, ProfileResponse } from '../types/profile'
import { apiRequest } from './api'

export function getProfile(): Promise<ProfileResponse> {
  return apiRequest<ProfileResponse>('/api/profile')
}

export function updateProfile(profile: ProfilePayload): Promise<ProfileResponse> {
  return apiRequest<ProfileResponse>('/api/profile', { method: 'PUT', body: JSON.stringify(profile) })
}
