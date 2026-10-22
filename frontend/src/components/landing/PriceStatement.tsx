import { useEffect, useRef } from 'react'
import { AvocadoArt, TomatoArt } from './FruitArt'

/**
 * Scroll progress of the section, written to `--price-progress`: 0 when its top enters the bottom of
 * the screen, 1 when its middle reaches the middle of the screen. The fruits use it to slide in from
 * the sides while the visitor scrolls. Under reduced motion it stays at 1, so they simply sit in place.
 */
function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      element.style.setProperty('--price-progress', '1')
      return
    }

    let frame = 0
    const update = () => {
      frame = 0
      const rect = element.getBoundingClientRect()
      const viewport = window.innerHeight
      const travel = viewport / 2 + rect.height / 2
      const progress = Math.min(1, Math.max(0, (viewport - rect.top) / travel))
      element.style.setProperty('--price-progress', progress.toFixed(3))
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return ref
}

export function PriceStatement() {
  const sectionRef = useScrollProgress<HTMLElement>()

  return <section className="public-price" aria-labelledby="public-price-title" ref={sectionRef}>
    <TomatoArt className="public-price__fruit public-price__fruit--tomato"/>
    <AvocadoArt className="public-price__fruit public-price__fruit--avocado"/>
    <div className="public-price__copy">
      <h2 id="public-price-title"><span className="public-price__value">R$ 26</span> por dia.<br/>Comida de verdade.</h2>
      <p>Café, almoço, lanche e jantar num plano de R$ 200 por semana. Você escolhe quanto quer gastar, e o cardápio cabe nisso.</p>
    </div>
  </section>
}
