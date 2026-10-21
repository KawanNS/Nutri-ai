import { useEffect, useRef, useState } from 'react'

/** Matches React Bits' CountUp feel (ease-out over ~0.9s) without pulling in an animation library. */
const easeOut = (t: number) => 1 - (1 - t) ** 3

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
}

interface CountUpProps {
  value: number
  format(value: number): string
  duration?: number
  delay?: number
  className?: string
}

/**
 * Counts from the previous value (0 on mount) to `value`. Screen readers get the final value only; the
 * moving digits are hidden from them. With reduced motion the number simply appears.
 */
export function CountUp({ value, format, duration = 900, delay = 0, className }: CountUpProps) {
  const [shown, setShown] = useState(0)
  const shownRef = useRef(0)
  const reduced = prefersReducedMotion()

  useEffect(() => {
    if (reduced) return
    const origin = shownRef.current
    const start = performance.now() + delay
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, Math.max(0, (now - start) / duration))
      const current = origin + (value - origin) * easeOut(progress)
      shownRef.current = current
      setShown(current)
      if (progress < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [value, duration, delay, reduced])

  return <span className={className}>
    <span aria-hidden="true">{format(reduced ? value : shown)}</span>
    <span className="ui-visually-hidden">{format(value)}</span>
  </span>
}
