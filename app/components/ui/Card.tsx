import type { ReactNode } from 'react'

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
}

export default function Card({ color = 'default', padded = false, children, className = '' }: CardProps) {
  const base = color === 'default' ? 'tcard' : `scard-${color}`
  const cls = `${base} ${padded ? 'tcard-p' : ''} ${className}`.trim()
  return <div className={cls}>{children}</div>
}
