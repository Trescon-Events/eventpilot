'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Event = { id: string; name: string; city: string | null; event_date: string | null; status: string }

const TOOLS = [
  {
    id:          'website-builder',
    label:       'Website Builder',
    description: 'Build and publish fully custom event websites end-to-end. Start from a template, design every section, load your brand, and go live with a single click — including custom domain via Cloudflare.',
    features:    [
      { icon: '◻', label: 'Drag-and-drop section builder', detail: 'Hero, stats, speakers, agenda, sponsors, media and more' },
      { icon: '◈', label: 'Brand system', detail: 'Logos, colour palette, fonts — applied across the whole site' },
      { icon: '▣', label: 'Live preview', detail: 'See your site on desktop, tablet and mobile before publishing' },
      { icon: '⊙', label: 'Custom domain', detail: 'Automated Cloudflare DNS — domain live in under a minute' },
      { icon: '◷', label: 'Draft & publish versioning', detail: 'Edit safely. Live site stays untouched until you publish. One-click rollback.' },
    ],
    accent:     '#00897B',
    route:      (eventId: string) => `/admin/events/${eventId}/website`,
    needsEvent: true,
    badge:      'Event Tool',
    category:   'Events',
  },
  {
    id:          'market-intel',
    label:       'Market Intelligence',
    description: 'AI-powered research engine for any event. Surface the right speakers, understand your competitive landscape, and identify the companies that belong in the room.',
    features:    [
      { icon: '◉', label: 'Competitor event analysis', detail: 'Understand what competing events are doing and where gaps exist' },
      { icon: '◈', label: 'Speaker discovery & scoring', detail: 'Find top voices in your sector ranked by relevance and reach' },
      { icon: '⊞', label: 'Company & industry mapping', detail: 'Map target companies, sectors, and decision-maker profiles' },
      { icon: '↓', label: 'Exportable reports', detail: 'Download intelligence as structured reports for your team' },
    ],
    accent:     '#6366F1',
    route:      (eventId: string) => `/admin/events/${eventId}/market-intel`,
    needsEvent: true,
    badge:      'Event Tool',
    category:   'Events',
  },
  {
    id:          'brand-studio',
    label:       'Brand Studio',
    description: 'Upload a brand document and extract the full identity — colours, fonts, tone of voice. Then generate on-brand visual assets using Imagen 3 for any event.',
    features:    [
      { icon: '◈', label: 'AI brand extraction', detail: 'Upload a PDF — colours, fonts and key messages pulled automatically' },
      { icon: '▣', label: 'Imagen 3 asset generation', detail: 'Generate hero images, social banners and key visuals on-brand' },
      { icon: '◉', label: 'Logo management', detail: 'Primary, white, dark and horizontal variants in one place' },
      { icon: '◻', label: 'Colour & typography system', detail: 'Define the palette and fonts that flow into the website builder' },
    ],
    accent:     '#A78BFA',
    route:      (eventId: string) => `/admin/events/${eventId}/brand`,
    needsEvent: true,
    badge:      'Event Tool',
    category:   'Events',
  },
  {
    id:          'smart-data',
    label:       'Smart Data',
    description: 'Your full B2B intelligence pipeline. Extract leads from any source, enrich them with LinkedIn and Apollo data, verify every email, and manage your contact database — all from one place.',
    features:    [
      { icon: '↓', label: 'File & URL extraction', detail: 'Upload CSVs, PDFs or paste a URL — contacts pulled instantly' },
      { icon: '◈', label: 'LinkedIn & Apollo enrichment', detail: 'Job titles, companies, LinkedIn profiles and contact details' },
      { icon: '◉', label: 'Email verification', detail: 'Bulk verify deliverability before any outreach campaign' },
      { icon: '⊞', label: 'Contact database', detail: 'Unified B2B database with tagging, filtering and CSV export' },
    ],
    accent:     '#00A5A3',
    href:       '/data/extract/file',
    needsEvent: false,
    badge:      'Data Intelligence',
    category:   'Data',
  },
  {
    id:          'outreach',
    label:       'Outreach',
    description: 'AI-generated content campaigns for every stage of the event lifecycle. Build pre-event, live week, and post-event flows across LinkedIn, email, and social — with an approval queue before anything goes out.',
    features:    [
      { icon: '▰', label: 'Multi-channel campaigns', detail: 'LinkedIn, email, WhatsApp and social in one campaign builder' },
      { icon: '◷', label: 'Pre / live / post event flows', detail: 'Structured timelines for every phase of your event' },
      { icon: '✎', label: 'AI content generation', detail: 'Channel-specific copy generated from your event brief' },
      { icon: '◉', label: 'Approval queue', detail: 'Review and approve before any post is published' },
    ],
    accent:     '#F59E0B',
    href:       '/content',
    needsEvent: false,
    badge:      'Campaigns',
    category:   'Data',
  },
  {
    id:          'course-builder',
    label:       'Course Builder',
    description: 'Create and publish courses for Event Pilot. Build structured modules, add randomised question banks, assign courses by role, and track completion across your entire team.',
    features:    [
      { icon: '≡', label: 'Module & lesson builder', detail: 'Structured learning paths with video, text and assessments' },
      { icon: '?', label: 'Randomised question banks', detail: 'Questions shuffle per attempt to prevent copying' },
      { icon: '⊞', label: 'Role-based assignment', detail: 'Assign specific courses to specific roles automatically' },
      { icon: '◷', label: 'Completion tracking', detail: 'Real-time progress and completion rates per staff member' },
    ],
    accent:     '#0EA5E9',
    href:       '/admin/courses',
    needsEvent: false,
    badge:      'Academy',
    category:   'Academy',
  },
  {
    id:          'tresagent',
    label:       'TresAgent',
    description: 'AI-powered voice and WhatsApp outreach agent. Automates delegate acquisition at scale — makes calls, sends follow-ups, and tracks every conversation across multiple events simultaneously.',
    features:    [
      { icon: '◉', label: 'Voice call automation', detail: 'AI agent calls prospects and handles the full conversation' },
      { icon: '▰', label: 'WhatsApp messaging flows', detail: 'Automated WhatsApp sequences with personalisation' },
      { icon: '⊞', label: 'Multi-event support', detail: 'Run acquisition campaigns for several events in parallel' },
      { icon: '◷', label: 'Live conversation tracking', detail: 'Full transcript and outcome log for every call and message' },
    ],
    accent:     '#EC4899',
    href:       'https://trescon-reach.vercel.app',
    needsEvent: false,
    badge:      'AI Agent',
    category:   'AI',
  },
]

const CATEGORIES = [
  { id: 'Events',  label: 'Event Tools' },
  { id: 'Data',    label: 'Data & Outreach' },
  { id: 'Academy', label: 'Academy' },
  { id: 'AI',      label: 'AI Agents' },
]

const ICONS: Record<string, React.ReactNode> = {
  'website-builder': <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/></svg>,
  'market-intel':    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/></svg>,
  'brand-studio':    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10c0 .833-.106 1.641-.305 2.413A4 4 0 0 1 12 22z"/></svg>,
  'smart-data':      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  'outreach':        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 2 11 13M22 2 15 22 11 13 2 9l20-7z"/></svg>,
  'course-builder':  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  'tresagent':       <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/><circle cx="19" cy="5" r="3"/></svg>,
}

function EventPicker({ tool, events, onClose }: { tool: typeof TOOLS[number]; events: Event[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const filtered = query.trim()
    ? events.filter(e => e.name.toLowerCase().includes(query.toLowerCase()) || (e.city ?? '').toLowerCase().includes(query.toLowerCase()))
    : events

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#0F1923' }}>Select an event</div>
            <div style={{ fontSize: '13px', color: '#5B7080', marginTop: '3px' }}>Opening: {tool.label}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B7080', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <svg width="14" height="14" fill="none" stroke="#5B7080" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search events…"
            style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: '10px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', color: '#0F1923', boxSizing: 'border-box', outline: 'none' }} />
        </div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {tool.id === 'market-intel' && (
            <Link href={tool.route!('__general__')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '12px', border: `1.5px solid ${tool.accent}40`, background: `${tool.accent}08`, textDecoration: 'none', marginBottom: '4px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F1923', marginBottom: '3px' }}>General Research</div>
                <div style={{ fontSize: '12px', color: '#5B7080' }}>Research without linking to a specific event</div>
              </div>
              <svg width="14" height="14" fill="none" stroke={tool.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </Link>
          )}
          {filtered.length === 0
            ? <div style={{ padding: '32px', textAlign: 'center', color: '#5B7080', fontSize: '14px' }}>No events match &ldquo;{query}&rdquo;.</div>
            : filtered.map(ev => (
              <Link key={ev.id} href={tool.route!(ev.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '12px', border: '1px solid #DDE8EE', background: '#FAFBFC', textDecoration: 'none', transition: 'all 0.15s' }}
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
            ))
          }
        </div>
      </div>
    </div>
  )
}

export default function ToolkitPage() {
  const [checking,  setChecking]  = useState(true)
  const [allowed,   setAllowed]   = useState(false)
  const [events,    setEvents]    = useState<Event[]>([])
  const [activeId,  setActiveId]  = useState(TOOLS[0].id)
  const [picking,   setPicking]   = useState(false)

  useEffect(() => {
    fetch('/api/toolkit-access').then(r => r.json()).then(d => { setAllowed(d.access === true); setChecking(false) }).catch(() => setChecking(false))
    fetch('/api/events').then(r => r.json()).then(d => setEvents(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const tool = TOOLS.find(t => t.id === activeId) ?? TOOLS[0]

  if (checking) return (
    <div style={{ height: '100vh', background: '#E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
      <span style={{ fontSize: '14px', color: '#5B7080' }}>Checking access…</span>
    </div>
  )

  if (!allowed) return (
    <div style={{ height: '100vh', background: '#E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-manrope), Manrope, sans-serif', padding: '24px' }}>
      <div style={{ maxWidth: '400px', textAlign: 'center' }}>
        <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: '#FFF1F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="22" height="22" fill="none" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F1923', marginBottom: '10px' }}>Access Restricted</div>
        <div style={{ fontSize: '15px', color: '#5B7080', lineHeight: 1.6, marginBottom: '28px' }}>The Toolkit is available to authorised team members only.</div>
        <Link href="/admin" style={{ display: 'inline-block', padding: '12px 28px', borderRadius: '10px', background: '#00897B', color: '#fff', fontSize: '14px', fontWeight: 700, textDecoration: 'none' }}>Back to Admin</Link>
      </div>
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#E8EEF4', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #DDE8EE', padding: '0 32px', height: '52px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, zIndex: 10 }}>
        <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#5B7080', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          Admin
        </Link>
        <span style={{ color: '#DDE8EE', fontSize: '13px' }}>/</span>
        <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Toolkit</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C0F43C', animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#9BAAB5', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Trescon Global</span>
        </div>
      </div>

      {/* Main split */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left sidebar ─────────────────────────────────────────────── */}
        <div style={{ width: '248px', flexShrink: 0, background: '#fff', borderRight: '1px solid #DDE8EE', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ padding: '20px 16px 8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#B8CDD8', letterSpacing: '2px', textTransform: 'uppercase' }}>All Tools</div>
          </div>
          {CATEGORIES.map(cat => {
            const catTools = TOOLS.filter(t => t.category === cat.id)
            return (
              <div key={cat.id} style={{ marginBottom: '4px' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#C8D8E4', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '10px 20px 4px' }}>{cat.label}</div>
                {catTools.map(t => {
                  const active = t.id === activeId
                  return (
                    <button key={t.id} onClick={() => setActiveId(t.id)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '11px', padding: '10px 16px', border: 'none', background: active ? `${t.accent}10` : 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderLeft: `3px solid ${active ? t.accent : 'transparent'}`, transition: 'all 0.15s' }}
                      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#F4F7FA' }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: active ? `${t.accent}18` : '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? t.accent : '#8899A8', flexShrink: 0, transition: 'all 0.15s' }}>
                        {ICONS[t.id]}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: active ? 800 : 600, color: active ? '#0F1923' : '#3D5060', lineHeight: 1.25 }}>{t.label}</div>
                        <div style={{ fontSize: '10px', color: active ? t.accent : '#B8CDD8', fontWeight: 700, marginTop: '1px', letterSpacing: '0.3px' }}>{t.badge}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* ── Right detail panel ────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '32px 40px', display: 'flex', alignItems: 'stretch' }}>
          <div style={{ flex: 1, background: '#fff', borderRadius: '20px', border: '1px solid #DDE8EE', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>

            {/* Panel header */}
            <div style={{ padding: '32px 36px 24px', borderBottom: '1px solid #EEF3F7' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: `${tool.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tool.accent, flexShrink: 0 }}>
                  <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    {(ICONS[tool.id] as React.ReactElement<{ children?: React.ReactNode }>).props.children}
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '22px', fontWeight: 900, color: '#0F1923', letterSpacing: '-0.3px' }}>{tool.label}</span>
                    <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: tool.accent, background: `${tool.accent}12`, padding: '3px 10px', borderRadius: '14px' }}>{tool.badge}</span>
                  </div>
                  <p style={{ fontSize: '15px', color: '#5B7080', lineHeight: 1.7, margin: 0, maxWidth: '680px' }}>{tool.description}</p>
                </div>
              </div>
            </div>

            {/* Features */}
            <div style={{ flex: 1, padding: '28px 36px', overflowY: 'auto' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#B8CDD8', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '20px' }}>What&apos;s included</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {tool.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: '14px', padding: '16px 18px', borderRadius: '12px', border: '1px solid #EEF3F7', background: '#FAFBFC', alignItems: 'flex-start' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${tool.accent}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" fill="none" stroke={tool.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '3px' }}>{f.label}</div>
                      <div style={{ fontSize: '12px', color: '#7A8FA0', lineHeight: 1.5 }}>{f.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA bar */}
            <div style={{ padding: '20px 36px', borderTop: '1px solid #EEF3F7', display: 'flex', alignItems: 'center', gap: '12px', background: '#FAFBFC' }}>
              {tool.needsEvent ? (
                <button onClick={() => setPicking(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 28px', borderRadius: '11px', background: tool.accent, color: '#fff', fontSize: '14px', fontWeight: 800, border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                  Select Event to Open
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ) : (tool.href as string).startsWith('http') ? (
                <a href={tool.href!} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 28px', borderRadius: '11px', background: tool.accent, color: '#fff', fontSize: '14px', fontWeight: 800, textDecoration: 'none', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.88')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}>
                  Open {tool.label}
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              ) : (
                <Link href={tool.href!}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 28px', borderRadius: '11px', background: tool.accent, color: '#fff', fontSize: '14px', fontWeight: 800, textDecoration: 'none', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.88')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}>
                  Open {tool.label}
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </Link>
              )}
              <span style={{ fontSize: '12px', color: '#B8CDD8', fontWeight: 600 }}>
                {tool.needsEvent ? 'Choose an event first — then the tool opens for that event.' : 'Opens directly — no event selection needed.'}
              </span>
            </div>

          </div>
        </div>
      </div>

      {picking && <EventPicker tool={tool} events={events} onClose={() => setPicking(false)} />}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  )
}
