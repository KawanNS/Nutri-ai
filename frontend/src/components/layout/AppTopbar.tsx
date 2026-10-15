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

  return <header className="topbar">
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
