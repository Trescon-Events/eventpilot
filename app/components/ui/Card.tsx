import type { CSSProperties, ReactNode } from 'react'

/*
  Thin wrapper over .tcard / .scard-* (app/globals.css). `color="default"`
  is the neutral .tcard surface; any other color maps to a tinted .scard-*
  section card. `padded` applies .tcard-p's padding to either variant,
  since .scard-* doesn't define its own.
*/

export type CardColor = 'default' | 'teal' | 'lime' | 'purple' | 'amber' | 'red' | 'indigo' | 'orange'

type CardProps = {
  color?: CardColor
  padded?: boolean
  children: ReactNode
  className?: string
  // Escape hatch for the rare case a card's content needs to break out of
  // .tcard's own `overflow: hidden` (e.g. an absolutely-positioned dropdown
  // flyout, like SearchableSelect, that would otherwise get clipped at the
  // card's edge instead of floating above the page).
  style?: CSSProperties
}

export default function Card({ color = 'default', padded = false, children, className = '', style }: CardProps) {
  const base = color === 'default' ? 'tcard' : `scard-${color}`
  const cls = `${base} ${padded ? 'tcard-p' : ''} ${className}`.trim()
  return <div className={cls} style={style}>{children}</div>
}
