'use client'

/*
  Corporate Deck Management — six-tab shell (Phase 1 chunk 1).

  Live tabs land in later chunks:
    - Overview          → chunk 2 (upload + Canva link + status)
    - Dynamic Content   → chunk 4 (editable workspace after Gemini confirms)
    - Testimonials      → chunk 4
    - Approved Images   → chunk 4
    - Version History   → chunk 5
    - Settings          → chunk 5

  For now each tab renders a "coming next" placeholder so Marketing +
  Durga can see the module live end-to-end before feature work lands.
*/

import { useState } from 'react'
import Link from 'next/link'

const BRAND = '#8B1A1A'

type TabId = 'overview' | 'content' | 'testimonials' | 'images' | 'versions' | 'settings'

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: 'overview',     label: 'Overview',        hint: 'Upload deck, save Canva link, run AI analysis' },
  { id: 'content',      label: 'Dynamic Content', hint: 'Company overview, vision, mission, stats, events, leadership' },
  { id: 'testimonials', label: 'Testimonials',    hint: 'Approved testimonials used in the deck' },
  { id: 'images',       label: 'Approved Images', hint: 'Corporate image library' },
  { id: 'versions',     label: 'Version History', hint: 'Every published deck version — immutable' },
  { id: 'settings',     label: 'Settings',        hint: 'Deck configuration + access' },
]

export default function CorporateDeckPage() {
  const [tab, setTab] = useState<TabId>('overview')

  return (
    <div style={{
      minHeight: '100vh',
      background: '#E8EEF4',
      fontFamily: 'var(--font-manrope), Manrope, sans-serif',
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* Breadcrumb bar */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #DDE8EE',
        padding: '0 32px',
        height: '52px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexShrink: 0,
      }}>
        <Link href="/admin/toolkit" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#5B7080', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          Toolkit
        </Link>
        <span style={{ color: '#DDE8EE', fontSize: '13px' }}>/</span>
        <span style={{ fontSize: '13px', color: '#5B7080', fontWeight: 600 }}>Corporate Marketing</span>
        <span style={{ color: '#DDE8EE', fontSize: '13px' }}>/</span>
        <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Deck</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: BRAND, background: `${BRAND}12`, padding: '3px 10px', borderRadius: '14px' }}>
            Phase 1 · MVP
          </span>
        </div>
      </div>

      {/* Module header */}
      <div style={{
        padding: '28px 40px 20px',
        background: '#fff',
        borderBottom: '1px solid #EEF3F7',
      }}>
        <div style={{ display: 'flex', gap: '18px', alignItems: 'flex-start' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: `${BRAND}12`, color: BRAND,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#0F1923', letterSpacing: '-0.3px' }}>
              Corporate Deck Management
            </div>
            <div style={{ fontSize: '14px', color: '#5B7080', marginTop: '6px', maxWidth: '760px', lineHeight: 1.6 }}>
              Manage all dynamic content in Trescon&apos;s corporate deck. Canva stays the master design file — EventPilot becomes the master source for content and every published version.
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #EEF3F7',
        padding: '0 40px',
        display: 'flex',
        gap: '2px',
        overflowX: 'auto',
      }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                border: 'none',
                background: 'transparent',
                padding: '14px 18px',
                fontSize: '13px',
                fontWeight: active ? 800 : 600,
                color: active ? BRAND : '#5B7080',
                borderBottom: `2px solid ${active ? BRAND : 'transparent'}`,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab body */}
      <div style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
        <div style={{
          maxWidth: '840px',
          background: '#fff',
          border: '1px solid #DDE8EE',
          borderRadius: '20px',
          padding: '40px',
          boxShadow: '0 2px 16px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            display: 'inline-block',
            fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px',
            textTransform: 'uppercase', color: BRAND,
            background: `${BRAND}10`, padding: '4px 10px', borderRadius: '12px',
            marginBottom: '14px',
          }}>
            Coming next
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F1923', marginBottom: '10px' }}>
            {TABS.find(t => t.id === tab)?.label}
          </div>
          <p style={{ fontSize: '14px', color: '#5B7080', lineHeight: 1.7, margin: 0 }}>
            {TABS.find(t => t.id === tab)?.hint}. This tab lights up in the next chunk of the build. The database, access gate, and module shell are already live.
          </p>
        </div>

        <div style={{
          marginTop: '20px',
          maxWidth: '840px',
          fontSize: '12px',
          color: '#8CA0B3',
          lineHeight: 1.6,
        }}>
          Foundation shipped in chunk 1 · Upload + AI analysis in chunk 2–3 · Editable workspace in chunk 4 · Publish + version history in chunk 5.
        </div>
      </div>
    </div>
  )
}
