import type { ReactNode } from 'react'

/* Thin wrapper over .tbadge* (app/globals.css). */

export type BadgeColor = 'teal' | 'purple' | 'amber' | 'red' | 'grey'

type BadgeProps = {
  color?: BadgeColor
  children: ReactNode
  className?: string
}

export default function Badge({ color = 'teal', children, className = '' }: BadgeProps) {
  return <span className={`tbadge tbadge-${color} ${className}`.trim()}>{children}</span>
}
