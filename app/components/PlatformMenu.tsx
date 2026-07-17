'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getModuleRegistry, type ModuleDef } from '@/app/lib/registry/modules'

/* ── Colour helpers — derive tile bg/border tints from each module's base colour,
   matching the ~0.08 / ~0.2 alpha every hand-coded tile used before this was
   registry-driven. ── */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `${r},${g},${b}`
}

type Tile = { title: string; description: string; href: string; icon: React.ReactNode; color: string; bg: string; border: string; external?: boolean }
type Section = { heading: string; items: Tile[] }

function buildSections(modules: ModuleDef[], keys: Set<string>, staffId: string): Section[] {
  const bySection = new Map<string, Tile[]>()

  for (const m of modules) {
    if (!m.platformMenu || !keys.has(m.key)) continue
    const color = m.platformMenu.color ?? m.color
    const rgb = hexToRgb(color)
    const tile: Tile = {
      title: m.platformMenu.label ?? m.label,
      description: m.platformMenu.description ?? m.description,
      href: typeof m.href === 'function' ? m.href({ staffId }) : m.href,
      icon: m.icon,
      color,
      bg: `rgba(${rgb},0.08)`,
      border: `rgba(${rgb},0.2)`,
      external: m.href === 'https://trescon-reach.vercel.app',
    }
    const section = m.platformMenu.section
    if (!bySection.has(section)) bySection.set(section, [])
    bySection.get(section)!.push(tile)
  }

  return Array.from(bySection.entries()).map(([heading, items]) => ({ heading, items }))
}

/* ── Component ──────────────────────────────────────────────── */
interface PlatformMenuProps {
  staffId?: string | null
}

export default function PlatformMenu({ staffId }: PlatformMenuProps) {
  const [open,       setOpen]       = useState(false)
  const [resolvedId, setResolvedId] = useState(staffId ?? '')
  const [keys,       setKeys]       = useState<Set<string> | null>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(s => setResolvedId(s?.sid ?? staffId ?? ''))
      .catch(() => {})
    fetch('/api/modules/accessible?surface=platformMenu')
      .then(r => r.json())
      .then(d => setKeys(new Set(Array.isArray(d.keys) ? d.keys : [])))
      .catch(() => setKeys(new Set()))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, close])

  const loaded = keys !== null
  const sections = loaded ? buildSections(getModuleRegistry(), keys!, resolvedId) : []

  return (
    <>
      {/* Grid icon trigger */}
      <button
        onClick={() => setOpen(true)}
        title="Platform menu"
        style={{
          width: '36px', height: '36px', borderRadius: '9px',
          background: 'var(--card)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <rect x="1" y="1" width="5" height="5" rx="1" fill="var(--teal-mid)"/>
          <rect x="9" y="1" width="5" height="5" rx="1" fill="var(--teal-mid)"/>
          <rect x="1" y="9" width="5" height="5" rx="1" fill="var(--teal-mid)"/>
          <rect x="9" y="9" width="5" height="5" rx="1" fill="var(--teal-mid)"/>
        </svg>
      </button>

      {/* Full-screen overlay */}
      {open && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: '72px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '860px', margin: '0 16px',
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: '16px', overflow: 'hidden',
              maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Event Pilot Platform</div>
                <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '2px' }}>Your workspace — everything you have access to</div>
              </div>
              <button
                onClick={close}
                style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <svg width="14" height="14" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Sections */}
            <div style={{ padding: '20px 24px 28px' }}>
              {!loaded ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ink4)', fontSize: '14px' }}>Loading…</div>
              ) : sections.map(section => (
                <div key={section.heading} style={{ marginBottom: '28px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: '12px' }}>
                    {section.heading}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {section.items.map(item => (
                      <Link
                        key={item.title}
                        href={item.href}
                        onClick={close}
                        target={item.external ? '_blank' : undefined}
                        rel={item.external ? 'noreferrer' : undefined}
                        style={{ textDecoration: 'none' }}
                      >
                        <div
                          style={{
                            padding: '16px',
                            background: item.bg,
                            border: `1px solid ${item.border}`,
                            borderRadius: '14px',
                            cursor: 'pointer',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                            height: '100%',
                          }}
                          onMouseEnter={e => {
                            const el = e.currentTarget as HTMLElement
                            el.style.borderColor = item.color
                            el.style.boxShadow = `0 2px 12px ${item.color}20`
                          }}
                          onMouseLeave={e => {
                            const el = e.currentTarget as HTMLElement
                            el.style.borderColor = item.border
                            el.style.boxShadow = 'none'
                          }}
                        >
                          <div style={{ color: item.color, marginBottom: '10px' }}>{item.icon}</div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>{item.title}</div>
                          <div style={{ fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.6 }}>{item.description}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
