import type { ReactNode } from 'react'

/*
  Thin wrapper over .stat-* (app/globals.css) — left-accent stat tiles.
  Kept separate from Card since it's a visually/semantically distinct
  pattern in the CSS (accent border, no tint fill), not just another color.
*/

export type StatColor = 'teal' | 'lime' | 'purple' | 'amber' | 'red' | 'indigo'

type StatCardProps = {
  color?: StatColor
  children: ReactNode
  className?: string
}

export default function StatCard({ color = 'teal', children, className = '' }: StatCardProps) {
  return <div className={`stat-${color} ${className}`.trim()}>{children}</div>
}
