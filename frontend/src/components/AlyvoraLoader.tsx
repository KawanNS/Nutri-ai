import { useId } from 'react'
import './AlyvoraLoader.css'

/**
 * The Alyvora "A" building itself: the left leaf grows from its base, then the right leaf from the
 * top, then the orange swoosh from the left; the mark fades and starts again. Only opacity and
 * transform are animated on the shapes themselves (no SVG masks), which Safari renders reliably.
 */
export function AlyvoraLoader({ size = 72, label }: { size?: number; label?: string }) {
  const id = useId().replace(/:/g, '')
  return <svg className="alyvora-loader" width={size} height={size * 0.8} viewBox="30 70 450 360" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
    <defs>
      <linearGradient id={`${id}-left`} x1="0" y1="1" x2=".8" y2="0"><stop offset="0" stopColor="#C5CE7C"/><stop offset=".55" stopColor="#8FAA52"/><stop offset="1" stopColor="#3E5A26"/></linearGradient>
      <linearGradient id={`${id}-right`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#BFCB78"/><stop offset=".45" stopColor="#6F8F3F"/><stop offset="1" stopColor="#28401A"/></linearGradient>
      <linearGradient id={`${id}-swoosh`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F7B878"/><stop offset="1" stopColor="#D8702B"/></linearGradient>
    </defs>
    <g className="alyvora-loader__mark">
      <path className="alyvora-loader__piece alyvora-loader__piece--2" d="M205 118 C 238 88 300 82 330 122 C 368 172 408 268 440 362 C 404 322 338 292 296 262 C 266 240 252 210 244 176 C 236 144 224 126 205 118 Z" fill={`url(#${id}-right)`}/>
      <path className="alyvora-loader__piece alyvora-loader__piece--1" d="M52 418 C 52 330 110 250 170 186 C 198 154 214 126 232 112 C 262 128 270 166 260 200 C 244 254 170 330 52 418 Z" fill={`url(#${id}-left)`}/>
      <path className="alyvora-loader__piece alyvora-loader__piece--3" d="M206 328 C 250 298 314 284 358 292 C 410 302 444 352 462 408 C 410 400 360 378 318 352 C 284 332 246 322 206 328 Z" fill={`url(#${id}-swoosh)`}/>
    </g>
  </svg>
}
