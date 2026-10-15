import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Badge } from '../ui/Badge'
import { useAccountMenu, type AccountIdentity, type PremiumState } from './accountMenuContext'

type FocusTarget = 'first' | 'last'

function accountInitial(account?: AccountIdentity) {
  const source = account?.name.trim() || account?.email.trim() || ''
  return source ? source.charAt(0).toLocaleUpperCase('pt-BR') : ''
}

function menuItems(menu: HTMLElement | null) {
  return Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
}

function focusMenuItem(menu: HTMLElement | null, index: number) {
  const items = menuItems(menu)
  if (items.length) items[(index + items.length) % items.length].focus()
}

function UserIcon() {
  return <svg className="profile-menu__icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5"/></svg>
}

function CardIcon() {
  return <svg className="profile-menu__icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M3.5 10h17M7.5 14.5h3"/></svg>
}

function SparkIcon() {
  return <svg className="profile-menu__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7-5.6-1.9L10.1 9Z"/></svg>
}

function LogoutIcon() {
  return <svg className="profile-menu__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14M10 16l-4-4 4-4M6 12h9.5"/></svg>
}

export function AccountAvatar({ account, size = 'md' }: { account?: AccountIdentity; size?: 'md' | 'lg' }) {
  const [pictureFailed, setPictureFailed] = useState(false)
  const initial = accountInitial(account)
  return <span className={`account-avatar account-avatar--${size}`} aria-hidden="true">
    {account?.pictureUrl && !pictureFailed
      ? <img src={account.pictureUrl} alt="" referrerPolicy="no-referrer" onError={() => setPictureFailed(true)}/>
      : initial || <UserIcon/>}
  </span>
}

function PremiumStatus({ premium }: { premium: PremiumState }) {
  if (premium === 'loading') return <Badge className="profile-menu__status" aria-busy="true">Verificando…</Badge>
  if (premium === 'premium') return <Badge className="profile-menu__status" variant="success">Premium</Badge>
  if (premium === 'admin') return <Badge className="profile-menu__status" variant="success">Premium (admin)</Badge>
  if (premium === 'free') return <Badge className="profile-menu__status">Gratuito</Badge>
  return <Badge className="profile-menu__status">Indisponível</Badge>
}

interface ProfileMenuProps {
  /** First-profile setup has nowhere else to go yet, so the menu only offers logout. */
  logoutOnly?: boolean
}

export function ProfileMenu({ logoutOnly = false }: ProfileMenuProps) {
  const { account, premium, onProfile, onSubscription, onLogout } = useAccountMenu()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null), triggerRef = useRef<HTMLButtonElement>(null), menuRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<FocusTarget | null>(null)
  const triggerId = useId(), menuId = useId(), statusId = useId()

  useEffect(() => {
    if (!open) return
    if (pendingFocus.current) {
      focusMenuItem(menuRef.current, pendingFocus.current === 'first' ? 0 : -1)
      pendingFocus.current = null
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  const openMenu = (focus: FocusTarget) => { pendingFocus.current = focus; setOpen(true) }
  const closeMenu = () => { setOpen(false); triggerRef.current?.focus() }
  const choose = (action: () => void) => { setOpen(false); action() }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu(event.key === 'ArrowDown' ? 'first' : 'last')
    }
  }

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = menuItems(menuRef.current)
    const current = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'ArrowDown') { event.preventDefault(); focusMenuItem(menuRef.current, current + 1) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); focusMenuItem(menuRef.current, current < 0 ? -1 : current - 1) }
    else if (event.key === 'Home') { event.preventDefault(); focusMenuItem(menuRef.current, 0) }
    else if (event.key === 'End') { event.preventDefault(); focusMenuItem(menuRef.current, -1) }
    else if (event.key === 'Tab') setOpen(false)
  }

  const handleRootKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); closeMenu() }
  }

  const accountLabel = account ? `Abrir menu da conta de ${account.name}` : 'Abrir menu da conta'

  return <div className="profile-menu" ref={rootRef} onKeyDown={handleRootKeyDown}>
    <button ref={triggerRef} id={triggerId} className="profile-menu__trigger" type="button" aria-label={accountLabel} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => open ? setOpen(false) : openMenu('first')} onKeyDown={handleTriggerKeyDown}>
      <AccountAvatar account={account}/>
    </button>
    {open && <div className="profile-menu__panel">
      <div className="profile-menu__identity">
        <AccountAvatar account={account} size="lg"/>
        <div><strong>{account?.name || 'Sua conta'}</strong>{account?.email && <span>{account.email}</span>}</div>
      </div>
      <div ref={menuRef} id={menuId} className="profile-menu__items" role="menu" aria-labelledby={triggerId} onKeyDown={handleMenuKeyDown}>
        {!logoutOnly && <>
          <button className="profile-menu__item" type="button" role="menuitem" tabIndex={-1} onClick={() => choose(onProfile)}><UserIcon/><span>Meu perfil</span></button>
          <button className="profile-menu__item" type="button" role="menuitem" tabIndex={-1} aria-describedby={statusId} onClick={() => choose(onSubscription)}><CardIcon/><span>Minha assinatura</span><span id={statusId}><PremiumStatus premium={premium}/></span></button>
          {premium === 'free' && <button className="profile-menu__item profile-menu__item--upgrade" type="button" role="menuitem" tabIndex={-1} onClick={() => choose(onSubscription)}><SparkIcon/><span>Assinar Premium</span></button>}
          <div className="profile-menu__separator" role="separator"/>
        </>}
        <button className="profile-menu__item profile-menu__item--logout" type="button" role="menuitem" tabIndex={-1} onClick={() => choose(onLogout)}><LogoutIcon/><span>Sair</span></button>
      </div>
    </div>}
  </div>
}
