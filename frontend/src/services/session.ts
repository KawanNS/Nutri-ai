import { renewSession } from './authService'
import { getToken, saveRole, saveToken, tokenIssuedAt } from './authToken'

// Tokens last 7 days; one renewal a day keeps anyone who opens the app signed in.
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000
let renewing: Promise<void> | undefined

export function renewSessionIfStale(): Promise<void> {
  const token = getToken()
  if (!token) return Promise.resolve()
  if (renewing) return renewing
  const issuedAt = tokenIssuedAt(token)
  if (issuedAt !== null && Date.now() - issuedAt < RENEW_AFTER_MS) return Promise.resolve()
  renewing = renewSession()
    .then(({ token: fresh, user }) => {
      // Skip if the user signed out or signed in again meanwhile.
      if (getToken() === token) { saveToken(fresh); saveRole(user.role) }
    })
    .catch(() => { /* An expired token already signs out through the 401 handler; anything else retries later. */ })
    .finally(() => { renewing = undefined })
  return renewing
}
