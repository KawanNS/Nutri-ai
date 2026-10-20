import { useEffect, useRef } from 'react'
import { BrandLogo } from '../BrandLogo'
import { DiaryNavButton } from '../DiaryNavButton'
import { ProfileMenu } from './ProfileMenu'

export type TopbarSection = 'meal-plan' | 'chat' | 'meal-photo' | 'diary' | 'progress'

interface AppTopbarProps {
  active?: TopbarSection
  onboarding?: boolean
  onMealPlan?(): void
  onChat?(): void
  onDiary?(): void
  onProgress?(): void
}

export function AppTopbar({ active, onboarding = false, onMealPlan, onChat, onDiary, onProgress }: AppTopbarProps) {
  const navButton = (section: TopbarSection, label: string, onClick?: () => void) => {
    const current = active === section
    return <button className={`nav-button${current ? ' nav-button--active' : ''}`} type="button" aria-current={current ? 'page' : undefined} onClick={current ? undefined : onClick}>{label}</button>
  }

  const headerRef = useRef<HTMLElement>(null)

  // On phones the sections scroll sideways when they do not fit (always with the extra "Foto do prato",
  // and at 320px even without it). Bring the current page into view and mark which edges hide more
  // items, so the CSS can fade that edge instead of cutting a label in half.
  useEffect(() => {
    const nav = headerRef.current?.querySelector<HTMLElement>('.app-topbar__nav')
    if (!nav) return
    const update = () => {
      const left = nav.scrollLeft > 1
      const right = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1
      if (left || right) nav.dataset.more = left && right ? 'both' : left ? 'left' : 'right'
      else delete nav.dataset.more
    }
    const current = nav.querySelector<HTMLElement>('[aria-current="page"]')
    if (current) {
      const hidden = current.getBoundingClientRect().right - nav.getBoundingClientRect().right
      if (hidden > 0) nav.scrollLeft += hidden + 16
    }
    update()
    nav.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      nav.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [active])

  return <header className="topbar" ref={headerRef}>
    <div className="topbar__content">
      <div className="brand"><BrandLogo/></div>
      {!onboarding && <nav className="topbar__actions app-topbar__nav" aria-label="Navegação principal">
        {navButton('meal-plan', 'Plano alimentar', onMealPlan)}
        {navButton('chat', 'Assistente', onChat)}
        {active === 'meal-photo' && navButton('meal-photo', 'Foto do prato')}
        <DiaryNavButton active={active === 'diary'} onClick={active === 'diary' ? undefined : onDiary}/>
        {navButton('progress', 'Evolução', onProgress)}
      </nav>}
      <ProfileMenu logoutOnly={onboarding}/>
    </div>
  </header>
}
