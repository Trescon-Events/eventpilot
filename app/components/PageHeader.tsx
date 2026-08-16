import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

/*
  Page-level title + description + actions — normal page content, not
  chrome. Sits at the top of a page's own content area, below the global
  shell (and a module's sidebar, if it has one). Intentionally re-renders
  on every navigation, since it's supposed to change per page — no Context
  or portal is needed for that, it's just a component.

  `backHref`/`backLabel` (2026-08-14, per Madhu — a platform-level
  convention, not a per-page decision): before this, "back to parent"
  navigation was hand-rolled per page via `actions` (a handful of pages had
  their own "← Back to X" Link+Button, most had none at all, no two looked
  quite the same). This formalizes it as one prop pair here — the one
  shared header component 38 of 56 admin pages already use — so every page
  that opts in renders it identically, positioned above the title where a
  back affordance is conventionally expected, instead of competing for
  space in `actions` (which stays for real per-page operations, not
  navigation).
*/

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  backHref?: string
  backLabel?: string
}

export default function PageHeader({ eyebrow, title, description, actions, backHref, backLabel = 'Back' }: PageHeaderProps) {
  return (
    <div style={{
      padding: '26px 32px 22px', borderBottom: '1px solid var(--border-light)', background: 'var(--card)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap',
      fontFamily: 'var(--font-manrope), Manrope, sans-serif',
    }}>
      <div>
        {backHref && (
          <Link href={backHref} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700,
            color: 'var(--ink3)', textDecoration: 'none', marginBottom: '12px',
          }}>
            <ArrowLeft size={15} /> {backLabel}
          </Link>
        )}
        {eyebrow && (
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '8px' }}>
            {eyebrow}
          </div>
        )}
        <h1 style={{ fontSize: '25px', fontWeight: 900, color: 'var(--ink)', letterSpacing: '-0.4px', textWrap: 'balance', margin: description ? '0 0 6px' : 0 }}>
          {title}
        </h1>
        {description && (
          <p style={{ fontSize: '13.5px', color: 'var(--ink3)', maxWidth: '52ch', lineHeight: 1.55, margin: 0 }}>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  )
}
