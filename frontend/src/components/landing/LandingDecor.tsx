// Hand-drawn landing ornaments. They are purely decorative: callers place them inside
// aria-hidden containers and the stylesheet keeps them out of pointer interaction.

interface DecorProps {
  className?: string
}

export function DecorLeaf({ className = '' }: DecorProps) {
  return <svg className={`landing-decor landing-decor-leaf ${className}`.trim()} viewBox="0 0 96 96" aria-hidden="true" focusable="false">
    <path className="landing-decor__fill" d="M12 86C9 50 30 18 86 10c4 48-22 76-74 76Z"/>
    <path className="landing-decor__vein" d="M14 84C34 62 52 42 78 18M33 61l-3-18M46 47l-2-17M58 35l1-13M33 61l17 3M46 47l17 2M58 35l14 1"/>
  </svg>
}

export function DecorSprig({ className = '' }: DecorProps) {
  return <svg className={`landing-decor landing-decor-sprig ${className}`.trim()} viewBox="0 0 120 80" aria-hidden="true" focusable="false">
    <path className="landing-decor__stem" d="M6 70C34 58 64 40 112 12"/>
    <path className="landing-decor__fill" d="M30 59c-6-14-2-26 10-32 5 13 1 25-10 32ZM52 47c-4-14 2-25 14-29 3 13-3 24-14 29ZM76 33c-2-13 5-22 17-24 1 12-6 21-17 24Z"/>
    <path className="landing-decor__fill landing-decor__fill--soft" d="M34 61c12-6 25-5 33 4-12 6-25 5-33-4ZM57 48c12-5 24-3 31 6-12 5-24 3-31-6ZM80 34c11-4 21-1 27 7-11 4-21 1-27-7Z"/>
  </svg>
}

export function DecorSeeds({ className = '' }: DecorProps) {
  return <svg className={`landing-decor landing-decor-seeds ${className}`.trim()} viewBox="0 0 64 40" aria-hidden="true" focusable="false">
    <ellipse className="landing-decor__fill" cx="10" cy="26" rx="4.5" ry="3" transform="rotate(-24 10 26)"/>
    <ellipse className="landing-decor__fill landing-decor__fill--soft" cx="28" cy="12" rx="5.5" ry="3.5" transform="rotate(18 28 12)"/>
    <ellipse className="landing-decor__fill" cx="46" cy="28" rx="3.5" ry="2.4" transform="rotate(-40 46 28)"/>
    <circle className="landing-decor__fill landing-decor__fill--soft" cx="58" cy="9" r="2.2"/>
  </svg>
}

export function DecorHerb({ className = '' }: DecorProps) {
  return <svg className={`landing-decor landing-decor-herb ${className}`.trim()} viewBox="0 0 140 120" aria-hidden="true" focusable="false">
    <path className="landing-decor__stem" d="M20 112C42 86 70 52 124 10"/>
    <path className="landing-decor__fill" d="M34 95c-14-4-21-14-20-27 13 3 20 13 20 27ZM50 76c-14-5-20-16-18-28 12 4 19 14 18 28ZM67 57c-13-6-18-17-15-29 12 5 17 16 15 29ZM86 39c-12-7-16-18-12-29 11 6 15 17 12 29Z"/>
    <path className="landing-decor__fill landing-decor__fill--soft" d="M38 96c4-14 14-21 27-20-3 13-13 20-27 20ZM55 77c5-14 15-20 28-18-4 12-14 19-28 18ZM72 58c6-13 17-18 29-15-5 12-16 17-29 15ZM91 40c7-12 18-16 29-12-6 11-17 15-29 12Z"/>
  </svg>
}

export function DecorLemon({ className = '' }: DecorProps) {
  return <svg className={`landing-decor landing-decor-lemon ${className}`.trim()} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <circle className="landing-decor__rind" cx="50" cy="50" r="46"/>
    <circle className="landing-decor__pith" cx="50" cy="50" r="39"/>
    <g className="landing-decor__fill">
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => <path key={angle} d="M50 45 L43 16 Q50 12 57 16 Z" transform={`rotate(${angle} 50 50)`}/>)}
    </g>
    <circle className="landing-decor__pith" cx="50" cy="50" r="4"/>
  </svg>
}

/** Organic edge between two section backgrounds; it takes the color of the section it belongs to. */
export function DecorWave({ className = '', flip = false }: DecorProps & { flip?: boolean }) {
  return <svg className={`landing-wave ${flip ? 'landing-wave--bottom' : 'landing-wave--top'} ${className}`.trim()} viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d={flip ? 'M0 0h1440v28c-120 30-260 48-430 36C820 50 700 14 520 14 330 14 190 56 0 44Z' : 'M0 80h1440V46c-150-28-300-40-470-20C800 46 690 70 520 66 340 62 210 22 0 30Z'}/>
  </svg>
}

/** Dotted, gently curving stem that links the "Como funciona" steps. */
export function DecorStem({ className = '' }: DecorProps) {
  return <svg className={`landing-decor landing-decor-stem ${className}`.trim()} viewBox="0 0 24 300" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path className="landing-decor__dots" d="M12 0C20 38 4 62 12 100s-8 62 0 100 8 62 0 100" vectorEffect="non-scaling-stroke"/>
  </svg>
}
