import { useEffect, useState } from 'react'
import { AlyvoraLoader } from './AlyvoraLoader'
import './WakingHint.css'

/**
 * Shown while a request is slow. The API sleeps when nobody has used it for a while and takes
 * 20-35 s to wake on the first visit of the day; this says so instead of leaving a silent spinner.
 * Appears only after `delayMs`, so normal fast requests never flash it.
 */
export function WakingHint({ delayMs = 3000 }: { delayMs?: number }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs])
  if (!visible) return null
  return <div className="waking-hint" role="status" aria-live="polite">
    <AlyvoraLoader size={40}/>
    <p><strong>Acordando o Alyvora…</strong><span>Na primeira entrada do dia pode levar até meio minuto.</span></p>
  </div>
}
