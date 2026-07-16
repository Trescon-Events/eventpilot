/*
  Page-level title + description + actions — normal page content, not
  chrome. Sits at the top of a page's own content area, below the global
  shell (and a module's sidebar, if it has one). Intentionally re-renders
  on every navigation, since it's supposed to change per page — no Context
  or portal is needed for that, it's just a component.
*/

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
}

export default function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div style={{
      padding: '26px 32px 22px', borderBottom: '1px solid var(--border-light)', background: 'var(--card)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap',
      fontFamily: 'var(--font-manrope), Manrope, sans-serif',
    }}>
      <div>
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
