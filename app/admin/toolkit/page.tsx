'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Event = { id: string; name: string; city: string | null; event_date: string | null; status: string }

const TOOLS = [
  {
    id:          'website-builder',
    label:       'Website Builder',
    description: 'Build and manage event websites. Pick an event to open its website editor.',
    accent:      '#00897B',
    route:       (eventId: string) => `/admin/events/${eventId}/website`,
    needsEvent:  true,
    badge:       'Event Tool',
    icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <path d="M3 9h18M9 21V9"/>
      </svg>
    ),
  },
  {
    id:          'drt',
    label:       'Market Intelligence',
    description: 'Research competitors, speakers, and companies for any event. AI-powered intelligence scanning.',
    accent:      '#6366F1',
    route:       (eventId: string) => `/admin/events/${eventId}/market-intel`,
    needsEvent:  true,
    badge:       'Event Tool',
    icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35M11 8v6M8 11h6"/>
      </svg>
    ),
  },
  {
    id:          'smart-data',
    label:       'Smart Data',
    description: 'Extract leads from files and URLs, enrich contacts via LinkedIn and Apollo, verify emails, and manage your B2B database.',
    accent:      '#00A5A3',
    href:        '/data/extract/file',
    needsEvent:  false,
    badge:       'Data Intelligence',
    icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <ellipse cx="12" cy="5" rx="9" ry="3"/>
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
      </svg>
    ),
  },
  {
    id:          'brand-studio',
    label:       'Brand Studio',
    description: 'AI brand identity + Imagen 3 visual asset generation for events. Colours, fonts, tone, key messages, and visual assets in one place.',
    accent:      '#A78BFA',
    route:       (eventId: string) => `/admin/events/${eventId}/brand`,
    needsEvent:  true,
    badge:       'Event Tool',
    icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/>
        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10c0 .833-.106 1.641-.305 2.413A4 4 0 0 1 12 22z"/>
      </svg>
    ),
  },
  {
    id:          'outreach',
    label:       'Outreach',
    description: 'AI-generated content campaigns for events. Build pre-event, live week, and post-event campaigns across all channels.',
    accent:      '#F59E0B',
    href:        '/content',
    needsEvent:  false,
    badge:       'Campaigns',
    icon: (
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M22 2 11 13M22 2 15 22 11 13 2 9l20-7z"/>
      </svg>
    ),
  },
]

function EventPicker({ tool, events, onClose }: {
  tool: typeof TOOLS[number]
  events: Event[]
  onClose: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}
      onClick={onClose}>
      <div style={{ background: '#FFFFFF', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#0F1923' }}>Select an event</div>
            <div style={{ fontSize: '13px', color: '#5B7080', marginTop: '3px' }}>Opening: {tool.label}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B7080', padding: '4px', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* General Research option — only for Market Intelligence */}
          {tool.id === 'drt' && (
            <Link href={tool.route!('__general__')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '12px', border: `1.5px solid ${tool.accent}40`, background: `${tool.accent}08`, textDecoration: 'none', marginBottom: '4px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = tool.accent }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = `${tool.accent}40` }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F1923', marginBottom: '3px' }}>General Research</div>
                <div style={{ fontSize: '12px', color: '#5B7080' }}>Research without linking to a specific event</div>
              </div>
              <svg width="14" height="14" fill="none" stroke={tool.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </Link>
          )}
          {tool.id === 'drt' && events.length > 0 && (
            <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B8CDD8', padding: '4px 4px 2px' }}>Or pick an event</div>
          )}
          {events.length === 0 && tool.id !== 'drt' ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#5B7080', fontSize: '14px' }}>No events found.</div>
          ) : events.map(ev => (
            <Link key={ev.id} href={tool.route!(ev.id)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '12px', border: '1px solid #DDE8EE', background: '#FAFBFC', textDecoration: 'none', transition: 'border-color 0.15s, background 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = tool.accent; (e.currentTarget as HTMLElement).style.background = `${tool.accent}08` }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#DDE8EE'; (e.currentTarget as HTMLElement).style.background = '#FAFBFC' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '3px' }}>{ev.name}</div>
                <div style={{ fontSize: '12px', color: '#5B7080', display: 'flex', gap: '10px' }}>
                  {ev.city && <span>{ev.city}</span>}
                  {ev.event_date && <span>{new Date(ev.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                  <span style={{ padding: '1px 7px', borderRadius: '8px', background: ev.status === 'active' ? 'rgba(192,244,60,0.15)' : '#E8EEF4', color: ev.status === 'active' ? '#3D6B00' : '#5B7080', fontWeight: 700 }}>{ev.status}</span>
                </div>
              </div>
              <svg width="14" height="14" fill="none" stroke={tool.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function ToolCard({ tool, events }: { tool: typeof TOOLS[number]; events: Event[] }) {
  const [hovered,  setHovered]  = useState(false)
  const [picking,  setPicking]  = useState(false)

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background:    '#FFFFFF',
          border:        `1px solid ${hovered ? tool.accent + '40' : '#DDE8EE'}`,
          borderRadius:  '20px',
          padding:       '32px',
          boxShadow:     hovered ? `0 8px 32px ${tool.accent}18` : '0 1px 4px rgba(0,165,163,0.06)',
          transition:    'all 0.2s ease',
          display:       'flex',
          flexDirection: 'column',
        }}>

        {/* Icon + badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: `${tool.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tool.accent, flexShrink: 0 }}>
            {tool.icon}
          </div>
          <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: tool.accent, background: `${tool.accent}15`, padding: '4px 10px', borderRadius: '16px' }}>
            {tool.badge}
          </span>
        </div>

        <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F1923', marginBottom: '10px', letterSpacing: '-0.3px' }}>{tool.label}</div>
        <div style={{ fontSize: '15px', color: '#5B7080', lineHeight: 1.65, flex: 1, marginBottom: '28px' }}>{tool.description}</div>

        {/* CTA */}
        {tool.needsEvent ? (
          <button onClick={() => setPicking(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '11px', background: tool.accent, color: '#FFFFFF', fontSize: '14px', fontWeight: 800, border: 'none', cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start', transition: 'opacity 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            Select Event
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        ) : (
          <Link href={tool.href!}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '11px', background: tool.accent, color: '#FFFFFF', fontSize: '14px', fontWeight: 800, textDecoration: 'none', alignSelf: 'flex-start', transition: 'opacity 0.15s' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.88')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}>
            Open {tool.label}
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </Link>
        )}
      </div>

      {picking && <EventPicker tool={tool} events={events} onClose={() => setPicking(false)} />}
    </>
  )
}

export default function ToolkitPage() {
  const [checking, setChecking] = useState(true)
  const [allowed,  setAllowed]  = useState(false)
  const [events,   setEvents]   = useState<Event[]>([])

  useEffect(() => {
    fetch('/api/toolkit-access')
      .then(r => r.json())
      .then(d => { setAllowed(d.access === true); setChecking(false) })
      .catch(() => setChecking(false))

    fetch('/api/events')
      .then(r => r.json())
      .then(d => setEvents(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', background: '#E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
        <div style={{ fontSize: '14px', color: '#5B7080' }}>Checking access…</div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div style={{ minHeight: '100vh', background: '#E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-manrope), Manrope, sans-serif', padding: '24px' }}>
        <div style={{ maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: '#FFF1F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="22" height="22" fill="none" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F1923', marginBottom: '10px' }}>Access Restricted</div>
          <div style={{ fontSize: '15px', color: '#5B7080', lineHeight: 1.6, marginBottom: '28px' }}>
            The Toolkit is available to authorised team members only. Contact your admin to request access.
          </div>
          <Link href="/admin" style={{ display: 'inline-block', padding: '12px 28px', borderRadius: '10px', background: '#00897B', color: 'white', fontSize: '14px', fontWeight: 700, textDecoration: 'none' }}>
            Back to Admin
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#E8EEF4', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#0F1923', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 40px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,0.5)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
              Admin
            </Link>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '14px' }}>/</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C0F43C', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF' }}>Toolkit</span>
            </div>
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Trescademy · Trescon Global
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '56px 40px' }}>

        {/* Hero */}
        <div style={{ marginBottom: '56px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: '#00897B', marginBottom: '14px' }}>Authorised Access Only</div>
          <h1 style={{ fontSize: '48px', fontWeight: 900, color: '#0F1923', margin: '0 0 16px', letterSpacing: '-1.5px', lineHeight: 1.08 }}>The Toolkit</h1>
          <p style={{ fontSize: '16px', color: '#5B7080', lineHeight: 1.65, maxWidth: '520px', margin: 0 }}>
            Internal tools for the Trescon team. Built to run events faster, reach more delegates, and deliver better results.
          </p>
        </div>

        {/* ── Section: Event Tools ── */}
        <div style={{ marginBottom: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#5B7080' }}>Event Tools</div>
            <div style={{ flex: 1, height: '1px', background: '#DDE8EE' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {TOOLS.filter(t => t.needsEvent).map(tool => (
              <ToolCard key={tool.id} tool={tool} events={events} />
            ))}
            {/* Outreach — not event-specific but part of event workflow */}
            {TOOLS.filter(t => !t.needsEvent && t.id === 'outreach').map(tool => (
              <ToolCard key={tool.id} tool={tool} events={events} />
            ))}
            {/* TresAgent — coming soon */}
            <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '20px', padding: '32px', position: 'relative', overflow: 'hidden', opacity: 0.5 }}>
              <div style={{ position: 'absolute', top: '16px', right: '16px', fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', background: '#E8EEF4', padding: '4px 10px', borderRadius: '16px' }}>
                Coming Soon
              </div>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: '#E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', color: '#B8CDD8' }}>
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/><circle cx="19" cy="5" r="3"/>
                </svg>
              </div>
              <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#B8CDD8', marginBottom: '8px' }}>AI Agent</div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F1923', marginBottom: '10px' }}>TresAgent</div>
              <div style={{ fontSize: '15px', color: '#5B7080', lineHeight: 1.6 }}>AI-powered voice and WhatsApp outreach agent. Automates delegate acquisition at scale.</div>
            </div>
          </div>
        </div>

        {/* ── Section: Data Intelligence ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#00A5A3' }}>Data Intelligence</div>
            <div style={{ flex: 1, height: '1px', background: 'rgba(0,165,163,0.2)' }} />
          </div>

          {/* Smart Data — full-width featured card */}
          <Link href="/data/extract/file" style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(0,165,163,0.08) 0%, rgba(0,165,163,0.03) 100%)',
              border: '1.5px solid rgba(0,165,163,0.3)',
              borderRadius: '20px',
              padding: '36px 40px',
              display: 'flex',
              alignItems: 'center',
              gap: '32px',
              cursor: 'pointer',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#00A5A3'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(0,165,163,0.15)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,165,163,0.3)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
            >
              {/* Icon */}
              <div style={{ width: '72px', height: '72px', borderRadius: '18px', background: 'rgba(0,165,163,0.12)', border: '1px solid rgba(0,165,163,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00A5A3', flexShrink: 0 }}>
                <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <ellipse cx="12" cy="5" rx="9" ry="3"/>
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
              </div>

              {/* Text */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#00A5A3', marginBottom: '8px' }}>Data Intelligence</div>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#0F1923', marginBottom: '10px', letterSpacing: '-0.5px' }}>Smart Data</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {['Lead Extraction', 'URL Extractor', 'LinkedIn Enricher', 'Email Verifier', 'Email Guesser', 'Contacts CRM', 'Companies DB'].map(tag => (
                    <span key={tag} style={{ fontSize: '12px', fontWeight: 700, color: '#00A5A3', background: 'rgba(0,165,163,0.1)', border: '1px solid rgba(0,165,163,0.2)', padding: '4px 10px', borderRadius: '20px' }}>{tag}</span>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 24px', borderRadius: '12px', background: '#00A5A3', color: '#FFFFFF', fontSize: '14px', fontWeight: 800, flexShrink: 0 }}>
                Open Smart Data
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </div>
          </Link>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  )
}
