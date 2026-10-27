const STORAGE_KEY = 'alyvora_origin'
const SOURCE_PATTERN = /^[a-z0-9_-]{1,40}$/
// Someone who taps an Instagram link today and signs up next week still counts as Instagram.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

let startRequested = false

/**
 * Reads a campaign link such as alyvora.vercel.app/?comecar=1&origem=instagram once, at startup:
 * remembers the source, notes whether to open the questions right away, and cleans the address bar.
 */
export function captureAcquisitionFromUrl(): void {
  const query = new URLSearchParams(window.location.search)
  if (!query.has('origem') && !query.has('comecar')) return
  const source = query.get('origem')?.trim().toLowerCase()
  if (source && SOURCE_PATTERN.test(source)) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ source, savedAt: Date.now() })) } catch { /* Not counted, nothing else. */ }
  }
  startRequested = query.has('comecar')
  query.delete('origem'); query.delete('comecar')
  const rest = query.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`)
}

/** Whether the link asked to skip the home page and start the questions (read when the app first mounts). */
export function startRequestedFromLink(): boolean {
  return startRequested
}

export function currentSource(): string | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { source?: string; savedAt?: number } | null
    if (!saved?.source || !SOURCE_PATTERN.test(saved.source) || typeof saved.savedAt !== 'number' || Date.now() - saved.savedAt > MAX_AGE_MS) return undefined
    return saved.source
  } catch { return undefined }
}

/** Adds ?source= to an API path. The URL, not the body, so an API without the field still accepts it. */
export function withSource(path: string): string {
  const source = currentSource()
  return source ? `${path}?source=${encodeURIComponent(source)}` : path
}
