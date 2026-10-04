interface DiaryNavButtonProps {
  active?: boolean
  onClick?(): void
}

export function DiaryIcon() {
  return <svg className="diary-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h11a2 2 0 0 1 2 2v12a1 1 0 0 1-1 1h-12a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z"/><path d="M8 3v3M15.5 3v3M8.5 10h7M8.5 14h5"/></svg>
}

export function DiaryNavButton({ active = false, onClick }: DiaryNavButtonProps) {
  return <button className={`nav-button nav-button--diary${active ? ' nav-button--active' : ''}`} type="button" aria-current={active ? 'page' : undefined} onClick={onClick}><DiaryIcon/>Diário</button>
}
