import { useEffect, useRef } from 'react'

export const REVEAL_STEP_MS = 80
export const REVEAL_MAX_STAGGERED = 3

/**
 * Delay for the nth sibling card: 0, 80, 160 and 240ms, then no delay.
 * Pass the result as the `--reveal-delay` custom property.
 */
export function revealDelay(index: number) {
  return `${index <= REVEAL_MAX_STAGGERED ? index * REVEAL_STEP_MS : 0}ms`
}

/**
 * Reveals `[data-reveal]` descendants once, when ~15% of each one enters the viewport.
 * Content stays visible unless the observer is available and motion is allowed: the hidden
 * starting state only applies after this hook marks the root with `reveal-ready`.
 *
 * After the page mounts and after every anchor jump, anything already on screen or above it is
 * revealed right away, so a jump never lands on blank space (the observer's bottom margin would
 * otherwise keep the lowest 10% of the screen hidden until the next scroll).
 */
export function useRevealOnScroll<T extends HTMLElement>() {
  const rootRef = useRef<T>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root || !('IntersectionObserver' in window)) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-revealed')
        observer.unobserve(entry.target)
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' })

    let frame = 0
    const revealReachedContent = () => {
      cancelAnimationFrame(frame)
      // Wait a frame so the jump (or the initial hash scroll) has already moved the page.
      frame = requestAnimationFrame(() => {
        root.querySelectorAll('[data-reveal]:not(.is-revealed)').forEach((target) => {
          if (target.getBoundingClientRect().top >= window.innerHeight) return
          target.classList.add('is-revealed')
          observer.unobserve(target)
        })
      })
    }

    // Clicking a link to the hash already in the URL jumps without firing `hashchange`.
    const handleAnchorClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a[href^="#"]')) revealReachedContent()
    }

    root.classList.add('reveal-ready')
    root.querySelectorAll('[data-reveal]').forEach((target) => observer.observe(target))
    revealReachedContent()
    window.addEventListener('hashchange', revealReachedContent)
    root.addEventListener('click', handleAnchorClick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('hashchange', revealReachedContent)
      root.removeEventListener('click', handleAnchorClick)
      observer.disconnect()
      root.classList.remove('reveal-ready')
    }
  }, [])

  return rootRef
}
