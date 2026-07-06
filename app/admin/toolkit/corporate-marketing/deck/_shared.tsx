'use client'

// Shared styles + tiny components used across the deck-management tabs.
export const BRAND = '#8B1A1A'

export function Badge({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', color, background: bg, padding: '5px 12px', borderRadius: '14px' }}>
      {children}
    </span>
  )
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{
      background: '#fff',
      border: '1px solid #DDE8EE',
      borderRadius: '20px',
      padding: '28px',
      boxShadow: '0 2px 16px rgba(0,0,0,0.04)',
      ...style,
    }}>
      {children}
    </section>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '11px', fontWeight: 800, color: '#B8CDD8', letterSpacing: '2px', textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

export function H2({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F1923', marginTop: '4px', ...style }}>
      {children}
    </div>
  )
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '10px', background: '#FFF4F4', border: '1px solid #FBCACA', color: '#C2410C', fontSize: '12px', fontWeight: 700 }}>
      {children}
    </div>
  )
}

export function PrimaryButton({ children, onClick, disabled, style }: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  style?: React.CSSProperties
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? '#EEF3F7' : BRAND,
        color: disabled ? '#94A3B8' : '#fff',
        border: 'none',
        borderRadius: '10px',
        padding: '11px 22px',
        fontSize: '13px',
        fontWeight: 800,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, onClick, style }: {
  children: React.ReactNode
  onClick?: () => void
  style?: React.CSSProperties
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        color: '#0F1923',
        border: '1px solid #DDE8EE',
        borderRadius: '10px',
        padding: '10px 18px',
        fontSize: '12px',
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'inherit',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: '10px',
  border: '1px solid #DDE8EE',
  fontSize: '13px',
  fontFamily: 'inherit',
  color: '#0F1923',
  outline: 'none',
  boxSizing: 'border-box',
}

export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: '80px',
  resize: 'vertical',
  lineHeight: 1.5,
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}
