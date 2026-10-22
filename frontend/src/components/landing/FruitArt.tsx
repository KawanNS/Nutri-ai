import { useId } from 'react'

/* Vector fruits for the price statement: whole, sharp at any size and a few hundred bytes each. */

export function TomatoArt({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return <svg className={className} viewBox="0 0 260 250" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={`${id}-body`} cx="38%" cy="35%" r="70%"><stop offset="0" stopColor="#FF8A66"/><stop offset=".35" stopColor="#F0472B"/><stop offset=".8" stopColor="#C92A16"/><stop offset="1" stopColor="#9E1C0C"/></radialGradient>
      <linearGradient id={`${id}-leaf`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6FA83E"/><stop offset="1" stopColor="#2F6420"/></linearGradient>
      <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    </defs>
    <ellipse cx="130" cy="232" rx="88" ry="10" fill="#5B4A26" opacity=".18" filter={`url(#${id}-blur)`}/>
    <path d="M130 52c-30-6-62 2-84 22-26 24-32 64-20 98 13 37 52 62 104 62s91-25 104-62c12-34 6-74-20-98-22-20-54-28-84-22z" fill={`url(#${id}-body)`}/>
    <path d="M130 58c-6 30-6 120 0 172M84 70c-22 26-28 74-6 120M176 70c22 26 28 74 6 120" stroke="#A3200F" strokeOpacity=".22" strokeWidth="3" fill="none"/>
    <ellipse cx="88" cy="104" rx="26" ry="16" fill="#fff" opacity=".45" transform="rotate(-30 88 104)" filter={`url(#${id}-blur)`}/>
    <ellipse cx="84" cy="100" rx="9" ry="5" fill="#fff" opacity=".85" transform="rotate(-30 84 100)"/>
    <path d="M130 66c-10-4-26-2-40 6 12 0 22 2 30 6-14 6-24 16-30 28 12-8 26-12 38-12-4 10-4 20 0 30 4-10 10-18 18-24 6 8 16 14 28 16-6-10-14-18-24-22 14-2 28 2 40 8-8-12-22-20-38-22 10-6 22-8 36-6-14-8-30-8-44-2-4 0-10 0-14-6z" fill={`url(#${id}-leaf)`}/>
    <path d="M130 70c0-14 4-28 14-38" stroke="#3E7426" strokeWidth="7" strokeLinecap="round" fill="none"/>
  </svg>
}

export function AvocadoArt({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return <svg className={className} viewBox="0 0 240 320" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-skin`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3D6B25"/><stop offset="1" stopColor="#1D3A12"/></linearGradient>
      <radialGradient id={`${id}-flesh`} cx="50%" cy="62%" r="62%"><stop offset="0" stopColor="#FBF6B8"/><stop offset=".55" stopColor="#E9EC94"/><stop offset="1" stopColor="#B9D46A"/></radialGradient>
      <radialGradient id={`${id}-pit`} cx="38%" cy="35%" r="70%"><stop offset="0" stopColor="#C67A43"/><stop offset=".6" stopColor="#8A4A1F"/><stop offset="1" stopColor="#5E2F10"/></radialGradient>
      <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    </defs>
    <ellipse cx="124" cy="304" rx="80" ry="10" fill="#5B4A26" opacity=".18" filter={`url(#${id}-blur)`}/>
    <g transform="rotate(-12 120 160)">
      <path d="M120 14c-30 0-46 32-52 70-7 46-40 74-40 128 0 52 42 88 92 88s92-36 92-88c0-54-33-82-40-128-6-38-22-70-52-70z" fill={`url(#${id}-skin)`}/>
      <path d="M120 26c-24 0-37 28-42 62-7 44-37 70-37 122 0 45 36 76 79 76s79-31 79-76c0-52-30-78-37-122-5-34-18-62-42-62z" fill="#8DBB4E"/>
      <path d="M120 34c-20 0-31 26-35 58-6 42-34 68-34 116 0 40 31 68 69 68s69-28 69-68c0-48-28-74-34-116-4-32-15-58-35-58z" fill={`url(#${id}-flesh)`}/>
      <ellipse cx="120" cy="198" rx="44" ry="50" fill={`url(#${id}-pit)`}/>
      <ellipse cx="104" cy="178" rx="13" ry="18" fill="#fff" opacity=".35" transform="rotate(-20 104 178)"/>
      <ellipse cx="100" cy="172" rx="4" ry="7" fill="#fff" opacity=".7" transform="rotate(-20 100 172)"/>
    </g>
  </svg>
}
