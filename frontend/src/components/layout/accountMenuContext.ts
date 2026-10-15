import { createContext, useContext } from 'react'

export type PremiumState = 'loading' | 'premium' | 'admin' | 'free' | 'unavailable'

export interface AccountIdentity {
  name: string
  email: string
  pictureUrl?: string | null
}

export interface AccountMenuValue {
  account?: AccountIdentity
  premium: PremiumState
  onProfile(): void
  onSubscription(): void
  onLogout(): void
}

export const AccountMenuContext = createContext<AccountMenuValue | null>(null)

export function useAccountMenu(): AccountMenuValue {
  const value = useContext(AccountMenuContext)
  if (!value) throw new Error('useAccountMenu must be used inside AccountMenuContext.Provider')
  return value
}
