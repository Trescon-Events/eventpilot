'use client'

/*
  Corporate Marketing landing — module picker.
  Grew from a single "Corporate Deck" module to a family:
    · CM-001   Corporate Deck Management
    · CM-002.1 Statistics Repository (Thulasi CMOS 2.1)
*/

import Link from 'next/link'

const BRAND = '#F1667A'

type Module = {
  code:  string
  title: string
  hint:  string
  href:  string
  icon:  string
}

const MODULES: Module[] = [
  {
    code:  'CM-001',
    title: 'Corporate Deck Management',
    hint:  'Master deck content · leadership · testimonials · versioned publish',
    href:  '/admin/toolkit/corporate-marketing/deck',
    icon:  '🖥',
  },
  {
    code:  'CM-002.1',
    title: 'Statistics Repository',
    hint:  'Single source of truth for every corporate statistic used across EventPilot',
    href:  '/admin/toolkit/corporate-marketing/statistics',
    icon:  '📊',
  },
]

export default function CorporateMarketingLanding() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'var(--font-manrope)' }}>
      <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '48px 24px 96px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: BRAND, letterSpacing: '2px', textTransform: 'uppercase' }}>
          Corporate Marketing
        </div>
        <h1 style={{ margin: '4px 0 8px', fontSize: '30px', fontWeight: 900, color: 'var(--ink)', letterSpacing: '-0.3px' }}>
          Modules
        </h1>
        <p style={{ margin: '0 0 32px', fontSize: '14px', color: 'var(--ink3)', maxWidth: '640px', lineHeight: 1.5 }}>
          The marketing operating layer inside EventPilot. Every module below feeds and consumes from the same underlying data.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px',
        }}>
          {MODULES.map(m => (
            <Link
              key={m.code}
              href={m.href}
              style={{
                display: 'block', padding: '22px 24px',
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: '16px', textDecoration: 'none',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '10px',
                  background: `${BRAND}15`, color: BRAND,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
                }}>{m.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '10px', fontWeight: 800, color: BRAND, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                    {m.code}
                  </div>
                  <div style={{ fontSize: '17px', fontWeight: 900, color: 'var(--ink)', marginTop: '2px' }}>
                    {m.title}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '6px', lineHeight: 1.45 }}>
                    {m.hint}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
