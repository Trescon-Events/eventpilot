'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import ResumeSidebar from '@/app/components/ResumeSidebar'
import { getModuleRegistry } from '@/app/lib/registry/modules'

type Event = { id: string; name: string; city: string | null; event_date: string | null; status: string }

type Tool = {
  id: string; label: string; description: string
  features: { icon: string; label: string; detail: string }[]
  accent: string
  route?: (eventId: string) => string
  href?: string
  needsEvent: boolean
  badge: string
  category: string
  /** registry key — used only to cross-check against /api/modules/accessible, not read by the rest of this page */
  registryKey: string
}

// Tile data (icons, labels, descriptions, hrefs) now comes from the shared
// module registry (app/lib/registry/modules.tsx) instead of a hardcoded
// array here — PlatformMenu.tsx reads the same source. Per-user visibility
// is resolved server-side via GET /api/modules/accessible?surface=toolkitHub
// instead of the old grants===null-means-admin dance.
function buildToolsFromRegistry(): Tool[] {
  return getModuleRegistry()
    .filter(m => m.toolkitHub)
    .map(m => {
      const t = m.toolkitHub!
      const href = typeof m.href === 'function' ? undefined : m.href
      const route = typeof m.href === 'function'
        ? (eventId: string) => (m.href as (ctx: { eventId?: string }) => string)({ eventId })
        : undefined
      return {
        id: t.legacyId ?? m.key,
        label: t.label ?? m.label,
        description: t.description ?? m.description,
        features: t.features ?? [],
        accent: t.color ?? m.color,
        route,
        href,
        needsEvent: !!m.needsEvent,
        badge: t.badge,
        category: t.category,
        registryKey: m.key,
      }
    })
}

// The 3 event-scoped tools whose "who can use this at all" access is managed
// globally, not per-event — see app/admin/toolkit/settings/event-tools/page.tsx.
// Shown as a small settings-gear link in the detail panel header below.
const EVENT_TOOL_SETTINGS_IDS = new Set(['website-builder', 'market-intel', 'brand-studio'])

const CATEGORIES = [
  { id: 'Knowledge',  label: 'Knowledge' },
  { id: 'Events',     label: 'Event Tools' },
  { id: 'Marketing',  label: 'Corporate Marketing' },
  { id: 'Data',       label: 'Data & Marketing' },
  { id: 'Operations', label: 'Operations' },
  { id: 'Finance',    label: 'Finance' },
  { id: 'Academy',    label: 'Academy' },
  { id: 'AI',         label: 'AI Agents' },
]

const ICONS: Record<string, React.ReactNode> = {
  'kb':              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  'docuhub':         <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  'knowledge-assistant': <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  'website-builder': <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/></svg>,
  'market-intel':    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/></svg>,
  'brand-studio':    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10c0 .833-.106 1.641-.305 2.413A4 4 0 0 1 12 22z"/></svg>,
  'smart-data':      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  'smart-excel':     <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>,
  'outreach':        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 2 11 13M22 2 15 22 11 13 2 9l20-7z"/></svg>,
  'ai-course-gen':   <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/><circle cx="19" cy="5" r="3"/></svg>,
  'course-manager':  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  'tresagent':       <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/><circle cx="19" cy="5" r="3"/></svg>,
  'bespoke-tracker': <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>,
  'hr-portal':       <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  'finance-portal':  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  'commercial':      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  'timesheets':      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  'corporate-marketing': <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  'admin-event-creative-templates': <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
}

function EventPicker({ tool, events, onClose }: { tool: Tool; events: Event[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [recentIds, setRecentIds] = useState<Set<string>>(new Set())

  // Fetch events with existing work (websites, brand guidelines) to show as "Recent Projects"
  useEffect(() => {
    Promise.all([
      fetch('/api/events/website?list=true').then(r => r.json()).catch(() => []),
      fetch('/api/events/brand?list=true').then(r => r.json()).catch(() => []),
    ]).then(([websites, brands]) => {
      const ids = new Set<string>()
      if (Array.isArray(websites)) websites.forEach((w: { event_id: string }) => ids.add(w.event_id))
      if (Array.isArray(brands)) brands.forEach((b: { event_id: string }) => ids.add(b.event_id))
      setRecentIds(ids)
    })
  }, [])

  const filtered = query.trim()
    ? events.filter(e => e.name.toLowerCase().includes(query.toLowerCase()) || (e.city ?? '').toLowerCase().includes(query.toLowerCase()))
    : events

  const recentEvents = filtered.filter(e => recentIds.has(e.id))
  const otherEvents = filtered.filter(e => !recentIds.has(e.id))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--ink)' }}>Select an event</div>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '3px' }}>Opening: {tool.label}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <svg width="14" height="14" fill="none" stroke="var(--ink3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search events…"
            style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)', boxSizing: 'border-box', outline: 'none' }} />
        </div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Recent / In-Progress Projects */}
          {recentEvents.length > 0 && !query.trim() && (
            <>
              <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--teal-mid)', padding: '4px 4px 0' }}>
                Your Recent Projects
              </div>
              {recentEvents.map(ev => (
                <Link key={ev.id} href={tool.route!(ev.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '12px', border: `1.5px solid ${tool.accent}30`, background: `${tool.accent}06`, textDecoration: 'none', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = tool.accent; (e.currentTarget as HTMLElement).style.background = `${tool.accent}12` }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = `${tool.accent}30`; (e.currentTarget as HTMLElement).style.background = `${tool.accent}06` }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '3px' }}>{ev.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)', display: 'flex', gap: '10px' }}>
                      {ev.city && <span>{ev.city}</span>}
                      <span style={{ padding: '1px 7px', borderRadius: '8px', background: 'color-mix(in srgb, var(--teal-mid) 12%, transparent)', color: 'var(--teal-mid)', fontWeight: 700 }}>In Progress</span>
                    </div>
                  </div>
                  <svg width="14" height="14" fill="none" stroke={tool.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </Link>
              ))}
              {otherEvents.length > 0 && (
                <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink4)', padding: '8px 4px 0' }}>
                  All Events
                </div>
              )}
            </>
          )}
          {tool.id === 'market-intel' && (
            <Link href={tool.route!('__general__')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '12px', border: `1.5px solid ${tool.accent}40`, background: `${tool.accent}08`, textDecoration: 'none', marginBottom: '4px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '3px' }}>General Research</div>
                <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Research without linking to a specific event</div>
              </div>
              <svg width="14" height="14" fill="none" stroke={tool.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </Link>
          )}
          {(query.trim() ? filtered : otherEvents).length === 0 && recentEvents.length === 0
            ? <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)', fontSize: '14px' }}>No events match &ldquo;{query}&rdquo;.</div>
            : (query.trim() ? filtered : otherEvents).map(ev => (
              <Link key={ev.id} href={tool.route!(ev.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card-hi)', textDecoration: 'none', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = tool.accent; (e.currentTarget as HTMLElement).style.background = `${tool.accent}08` }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--card-hi)' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '3px' }}>{ev.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', display: 'flex', gap: '10px' }}>
                    {ev.city && <span>{ev.city}</span>}
                    {ev.event_date && <span>{new Date(ev.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                    <span style={{ padding: '1px 7px', borderRadius: '8px', background: ev.status === 'active' ? 'color-mix(in srgb, var(--lime) 15%, transparent)' : 'var(--surface)', color: ev.status === 'active' ? 'var(--lime-dark)' : 'var(--ink3)', fontWeight: 700 }}>{ev.status}</span>
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
  const allTools = useMemo(buildToolsFromRegistry, [])
  const [checking,  setChecking]  = useState(true)
  const [accessibleKeys, setAccessibleKeys] = useState<Set<string> | null>(null)
  const [events,    setEvents]    = useState<Event[]>([])
  // Matches the original hardcoded TOOLS array's first entry (Website
  // Builder) — the registry's own ordering differs, so this is pinned
  // explicitly rather than defaulting to whatever's first in the registry.
  const [activeId,  setActiveId]  = useState(allTools.find(t => t.id === 'website-builder')?.id ?? allTools[0].id)
  const [picking,   setPicking]   = useState(false)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(CATEGORIES.map(c => c.id)))

  useEffect(() => {
    fetch('/api/modules/accessible?surface=toolkitHub').then(r => r.json()).then(d => {
      setAccessibleKeys(new Set(Array.isArray(d.keys) ? d.keys : []))
      setChecking(false)
    }).catch(() => setChecking(false))
    fetch('/api/events').then(r => r.json()).then(d => setEvents(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const visibleTools = allTools.filter(t => accessibleKeys?.has(t.registryKey))
  const allowed = visibleTools.length > 0

  const tool = visibleTools.find(t => t.id === activeId) ?? visibleTools[0] ?? allTools[0]

  if (checking) return (
    <div style={{ height: '100vh', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
      <span style={{ fontSize: '14px', color: 'var(--ink3)' }}>Checking access…</span>
    </div>
  )

  if (!allowed) return (
    <div style={{ height: '100vh', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-manrope), Manrope, sans-serif', padding: '24px' }}>
      <div style={{ maxWidth: '400px', textAlign: 'center' }}>
        <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="22" height="22" fill="none" stroke="var(--danger)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)', marginBottom: '10px' }}>Access Restricted</div>
        <div style={{ fontSize: '15px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '28px' }}>The Toolkit is available to authorised team members only.</div>
        <Link href="/admin" style={{ display: 'inline-block', padding: '12px 28px', borderRadius: '10px', background: 'var(--teal-mid)', color: 'var(--teal-light)', fontSize: '14px', fontWeight: 700, textDecoration: 'none' }}>Back to Admin</Link>
      </div>
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: 'var(--surface)', overflow: 'hidden' }}>

      {/* ── Left sidebar ─────────────────────────────────────────────── */}
      <div style={{ width: '260px', flexShrink: 0, background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ padding: '20px 16px 8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink4)', letterSpacing: '2px', textTransform: 'uppercase' }}>All Tools</div>
          </div>
          {CATEGORIES.map(cat => {
            const catTools = visibleTools.filter(t => t.category === cat.id)
            if (catTools.length === 0) return null
            const expanded = expandedCats.has(cat.id)
            const catAccent = catTools[0]?.accent ?? 'var(--ink3)'
            const hasActive = catTools.some(t => t.id === activeId)
            return (
              <div key={cat.id} style={{ marginBottom: '2px' }}>
                {/* Category header — clickable to expand/collapse */}
                <button
                  onClick={() => setExpandedCats(prev => { const next = new Set(prev); if (next.has(cat.id)) next.delete(cat.id); else next.add(cat.id); return next })}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 10px 20px', border: 'none', background: hasActive && !expanded ? `${catAccent}15` : 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--border-light)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = hasActive && !expanded ? `${catAccent}15` : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: catAccent, flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', fontWeight: 800, color: expanded ? catAccent : 'var(--ink3)', letterSpacing: '1.2px', textTransform: 'uppercase' }}>{cat.label}</span>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink4)', background: 'var(--border-light)', padding: '1px 6px', borderRadius: '8px' }}>{catTools.length}</span>
                  </div>
                  <svg width="12" height="12" fill="none" stroke="var(--ink4)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {/* Tools list — shown when expanded */}
                {expanded && catTools.map(t => {
                  const active = t.id === activeId
                  return (
                    <button key={t.id} onClick={() => setActiveId(t.id)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '11px', padding: '9px 16px 9px 28px', border: 'none', background: active ? `${t.accent}12` : 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderLeft: `3px solid ${active ? t.accent : 'transparent'}`, transition: 'all 0.15s' }}
                      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--border-light)' }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = active ? `${t.accent}12` : 'transparent' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: active ? `${t.accent}1F` : 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? t.accent : 'var(--ink3)', flexShrink: 0, transition: 'all 0.15s' }}>
                        {ICONS[t.id]}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: active ? 800 : 600, color: active ? t.accent : 'var(--ink3)', lineHeight: 1.25 }}>{t.label}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}

          {/* Resume Work — Khalifa review fcdbcbff. Shows the user's
              active drafts + team-shared drafts. Clicking one navigates
              directly into the tool for that event. */}
          <ResumeSidebar
            toolLabels={Object.fromEntries(allTools.map(t => [t.id.replace(/-/g, '_'), t.label]))}
            resolveRoute={(toolKey, eventId) => {
              const t = allTools.find(x => x.id.replace(/-/g, '_') === toolKey)
              if (!t) return null
              if (t.needsEvent && eventId && typeof t.route === 'function') return t.route(eventId)
              if (!t.needsEvent && typeof t.href === 'string') return t.href
              return null
            }}
          />
        </div>

        {/* ── Right detail panel ────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '32px 40px', display: 'flex', alignItems: 'stretch' }}>
          <div style={{ flex: 1, background: 'var(--card)', borderRadius: '20px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>

            {/* Panel header */}
            <div style={{ padding: '32px 36px 24px', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: `${tool.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tool.accent, flexShrink: 0 }}>
                  <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    {(ICONS[tool.id] as React.ReactElement<{ children?: React.ReactNode }>).props.children}
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)', letterSpacing: '-0.3px' }}>{tool.label}</span>
                    <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: tool.accent, background: `${tool.accent}12`, padding: '3px 10px', borderRadius: '14px' }}>{tool.badge}</span>
                  </div>
                  <p style={{ fontSize: '15px', color: 'var(--ink3)', lineHeight: 1.7, margin: 0, maxWidth: '680px' }}>{tool.description}</p>
                </div>
                {EVENT_TOOL_SETTINGS_IDS.has(tool.id) && (
                  <Link href={`/admin/toolkit/settings/event-tools?tab=${tool.id}`} title="Manage who can use this tool"
                    style={{ marginLeft: 'auto', flexShrink: 0, width: '36px', height: '36px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card-hi)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', textDecoration: 'none', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = tool.accent; (e.currentTarget as HTMLElement).style.borderColor = tool.accent }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                  </Link>
                )}
              </div>
            </div>

            {/* Features */}
            <div style={{ flex: 1, padding: '28px 36px', overflowY: 'auto' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ink4)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '20px' }}>What&apos;s included</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {tool.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: '14px', padding: '16px 18px', borderRadius: '12px', border: '1px solid var(--border-light)', background: 'var(--card-hi)', alignItems: 'flex-start' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${tool.accent}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" fill="none" stroke={tool.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '3px' }}>{f.label}</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.5 }}>{f.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA bar */}
            <div style={{ padding: '20px 36px', borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--card-hi)' }}>
              {tool.needsEvent ? (
                <button onClick={() => setPicking(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 28px', borderRadius: '11px', background: tool.accent, color: 'var(--surface)', fontSize: '14px', fontWeight: 800, border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                  Select Event to Open
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ) : (tool.href as string).startsWith('http') ? (
                <a href={tool.href!} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 28px', borderRadius: '11px', background: tool.accent, color: 'var(--surface)', fontSize: '14px', fontWeight: 800, textDecoration: 'none', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.88')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}>
                  Open {tool.label}
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              ) : (
                <Link href={tool.href!}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 28px', borderRadius: '11px', background: tool.accent, color: 'var(--surface)', fontSize: '14px', fontWeight: 800, textDecoration: 'none', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.88')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}>
                  Open {tool.label}
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </Link>
              )}
              <span style={{ fontSize: '12px', color: 'var(--ink4)', fontWeight: 600 }}>
                {tool.needsEvent ? 'Choose an event first — then the tool opens for that event.' : 'Opens directly — no event selection needed.'}
              </span>
            </div>

          </div>
        </div>

      {picking && <EventPicker tool={tool} events={events} onClose={() => setPicking(false)} />}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  )
}
