import Link from 'next/link'
import type { MouseEventHandler, ReactNode } from 'react'

/*
  Thin wrapper over the existing .tbtn* classes (app/globals.css) — same
  tokens, same visual language, no new design. Reach for this instead of a
  hand-rolled `<button style={{ ...var(--token) }}>` so on-brand is the
  default path, not a convention to remember.
*/

export type ButtonVariant = 'teal' | 'indigo' | 'purple' | 'amber' | 'red' | 'ghost' | 'solid' | 'lime'

type ButtonProps = {
  variant?: ButtonVariant
  children: ReactNode
  className?: string
  href?: string
  target?: string
  rel?: string
  onClick?: MouseEventHandler<HTMLButtonElement>
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  title?: string
}

export default function Button({
  variant = 'teal', children, className = '', href, target, rel, onClick, type = 'button', disabled, title,
}: ButtonProps) {
  const cls = `tbtn tbtn-${variant} ${className}`.trim()

  if (href !== undefined) {
    return (
      <Link href={href} target={target} rel={rel} className={cls} title={title}>
        {children}
      </Link>
    )
  }

  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  )
}
