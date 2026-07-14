'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'

type DelegateStats = { total: number; registered: number; attended: number }

type BespokeProject = {
  id: string
  title: string
  client_company: string
  format: string
  event_date: string | null
  phase: string
  target_delegate_count: number
  contract_value: number
  delegate_stats: DelegateStats
  commercial_lead: { id: string; name: string } | null
  marketing_lead: { id: string; name: string } | null
  delegate_lead: { id: string; name: string } | null
  operations_lead: { id: string; name: string } | null
  design_lead: { id: string; name: string } | null
  created_at: string
}

const PHASE_LABELS: Record<string, string> = {
  initiation: 'Initiation',
  campaign: 'Campaign',
  live: 'Live',
  closure: 'Closure',
  completed: 'Completed',
}

const PHASE_COLORS: Record<string, { bg: string; fg: string }> = {
  initiation: { bg: '#FFF8E1', fg: '#B45309' },
  campaign: { bg: '#E0F2F1', fg: '#00695C' },
  live: { bg: '#E8F5E9', fg: '#2E7D32' },
  closure: { bg: '#F3E5F5', fg: '#7B1FA2' },
  completed: { bg: '#ECEFF1', fg: '#546E7A' },
}

const FORMAT_COLORS: Record<string, { bg: string; fg: string }> = {
  physical: { bg: '#E8F5E9', fg: '#2E7D32' },
  virtual: { bg: '#E3F2FD', fg: '#1565C0' },
  hybrid: { bg: '#F3E5F5', fg: '#7B1FA2' },
}

const KANBAN_COLS = [
  { key: 'initiation', label: 'Initiation', phases: ['initiation'] },
  { key: 'campaign', label: 'Campaign', phases: ['campaign'] },
  { key: 'live', label: 'Live', phases: ['live'] },
  { key: 'closure', label: 'Closure', phases: ['closure', 'completed'] },
]

function daysLeft(eventDate: string | null): number | null {
  if (!eventDate) return null
  const diff = Math.ceil((new Date(eventDate).getTime() - Date.now()) / 86400000)
  return diff
}

function fmtDate(d: string | null): string {
  if (!d) return '--'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/* ── Back Arrow SVG ────────────────────────────────────────────── */
function BackArrow() {
  return (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

/* ── Plus SVG ──────────────────────────────────────────────────── */
function PlusIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

/* ── Kanban / Table Toggle Icons ───────────────────────────────── */
function KanbanIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" fill={active ? '#00695C' : '#5B7080'} viewBox="0 0 24 24">
      <rect x="2" y="3" width="6" height="18" rx="1" /><rect x="9" y="3" width="6" height="12" rx="1" /><rect x="16" y="3" width="6" height="15" rx="1" />
    </svg>
  )
}
function TableIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" fill="none" stroke={active ? '#00695C' : '#5B7080'} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

/* ── Progress Bar ──────────────────────────────────────────────── */
function ProgressBar({ value, max, height = 6 }: { value: number; max: number; height?: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{ height, background: '#E8EEF4', borderRadius: height / 2, overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: pct >= 80 ? '#2E7D32' : pct >= 50 ? '#00695C' : '#B45309', borderRadius: height / 2, transition: 'width 0.4s ease' }} />
    </div>
  )
}

/* ── Kanban Card ───────────────────────────────────────────────── */
function ProjectCard({ p }: { p: BespokeProject }) {
  const days = daysLeft(p.event_date)
  const fmtC = FORMAT_COLORS[p.format] || FORMAT_COLORS.physical
  return (
    <Link href={`/admin/bespoke/${p.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div style={{
        background: '#FFFFFF', borderRadius: '10px', padding: '16px', border: '1px solid #DDE8EE',
        cursor: 'pointer', transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = '#B45309' }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#DDE8EE' }}
      >
        {/* Title + Format */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
          <div style={{ fontFamily: 'var(--font-manrope)', fontWeight: 700, fontSize: '15px', color: '#0F1923', lineHeight: '1.3' }}>{p.title}</div>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: fmtC.bg, color: fmtC.fg, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {p.format}
          </span>
        </div>

        {/* Client */}
        <div style={{ fontSize: '13px', color: '#5B7080', fontWeight: 500, marginBottom: '10px' }}>{p.client_company}</div>

        {/* Event date + Days left */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '12px', color: '#5B7080' }}>{fmtDate(p.event_date)}</span>
          {days !== null && (
            <span style={{ fontSize: '11px', fontWeight: 700, color: days <= 7 ? '#DC2626' : days <= 14 ? '#B45309' : '#5B7080' }}>
              {days > 0 ? `${days}d left` : days === 0 ? 'Today' : `${Math.abs(days)}d ago`}
            </span>
          )}
        </div>

        {/* Registration progress */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', color: '#5B7080', fontWeight: 600 }}>Registrations</span>
            <span style={{ fontSize: '11px', color: '#0F1923', fontWeight: 700 }}>{p.delegate_stats.registered} / {p.target_delegate_count}</span>
          </div>
          <ProgressBar value={p.delegate_stats.registered} max={p.target_delegate_count} />
        </div>

        {/* Commercial lead */}
        {p.commercial_lead && (
          <div style={{ fontSize: '12px', color: '#5B7080', marginTop: '8px' }}>
            <span style={{ fontWeight: 600 }}>Lead:</span> {p.commercial_lead.name}
          </div>
        )}
      </div>
    </Link>
  )
}

/* ── Sort Header Helper ────────────────────────────────────────── */
function SortHead({ label, field, sortBy, sortDir, onSort }: {
  label: string; field: string; sortBy: string; sortDir: 'asc' | 'desc'
  onSort: (f: string) => void
}) {
  const active = sortBy === field
  return (
    <th
      onClick={() => onSort(field)}
      style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: active ? '#00695C' : '#5B7080', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', borderBottom: '1px solid #DDE8EE' }}
    >
      {label} {active ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}
    </th>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function BespokePipelinePage() {
  const [projects, setProjects] = useState<BespokeProject[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'kanban' | 'table'>('kanban')
  const [sortBy, setSortBy] = useState('event_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    fetch('/api/bespoke')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setProjects(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleSort = (field: string) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => {
      const m = sortDir === 'asc' ? 1 : -1
      if (sortBy === 'title') return m * (a.title || '').localeCompare(b.title || '')
      if (sortBy === 'client_company') return m * (a.client_company || '').localeCompare(b.client_company || '')
      if (sortBy === 'event_date') return m * ((a.event_date || '').localeCompare(b.event_date || ''))
      if (sortBy === 'phase') return m * ((a.phase || '').localeCompare(b.phase || ''))
      if (sortBy === 'registrations') return m * ((a.delegate_stats.registered || 0) - (b.delegate_stats.registered || 0))
      if (sortBy === 'lead') return m * ((a.commercial_lead?.name || '').localeCompare(b.commercial_lead?.name || ''))
      if (sortBy === 'days_left') return m * ((daysLeft(a.event_date) ?? 9999) - (daysLeft(b.event_date) ?? 9999))
      return 0
    })
  }, [projects, sortBy, sortDir])

  /* ── Loading ──────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '15px', color: '#5B7080', fontFamily: 'var(--font-manrope)', fontWeight: 600 }}>Loading bespoke projects...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#E8EEF4', fontFamily: 'var(--font-manrope)' }}>
      {/* ── Dark Header Bar ─────────────────────────────────────── */}
      <div style={{ background: '#0F1923', padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/admin/toolkit" style={{ color: '#5B7080', display: 'flex', alignItems: 'center' }}>
            <BackArrow />
          </Link>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#FFFFFF' }}>Bespoke Tracker</h1>
          <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px', background: '#B4530920', color: '#B45309' }}>
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </span>
        </div>
        <Link href="/admin/bespoke/new" style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', borderRadius: '8px',
          background: '#B45309', color: '#FFFFFF', fontSize: '14px', fontWeight: 700, textDecoration: 'none',
          transition: 'background 0.2s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = '#92400E')}
          onMouseLeave={e => (e.currentTarget.style.background = '#B45309')}
        >
          <PlusIcon /> New Project
        </Link>
      </div>

      {/* ── View Toggle Bar ─────────────────────────────────────── */}
      <div style={{ padding: '16px 32px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button onClick={() => setView('kanban')} style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px',
          border: view === 'kanban' ? '2px solid #00695C' : '1px solid #B8CDD8', background: view === 'kanban' ? '#E0F2F1' : '#FFFFFF',
          fontSize: '13px', fontWeight: 700, color: view === 'kanban' ? '#00695C' : '#5B7080', cursor: 'pointer',
        }}>
          <KanbanIcon active={view === 'kanban'} /> Kanban
        </button>
        <button onClick={() => setView('table')} style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px',
          border: view === 'table' ? '2px solid #00695C' : '1px solid #B8CDD8', background: view === 'table' ? '#E0F2F1' : '#FFFFFF',
          fontSize: '13px', fontWeight: 700, color: view === 'table' ? '#00695C' : '#5B7080', cursor: 'pointer',
        }}>
          <TableIcon active={view === 'table'} /> Table
        </button>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div style={{ padding: '20px 32px 48px' }}>
        {projects.length === 0 ? (
          /* Empty State */
          <div style={{
            background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', padding: '64px 32px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', color: '#B8CDD8' }}>
              <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ color: '#B8CDD8' }}>
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" />
              </svg>
            </div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#0F1923', marginBottom: '8px' }}>No bespoke projects yet</div>
            <div style={{ fontSize: '15px', color: '#5B7080', marginBottom: '24px' }}>Create your first one.</div>
            <Link href="/admin/bespoke/new" style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '8px',
              background: '#B45309', color: '#FFFFFF', fontSize: '14px', fontWeight: 700, textDecoration: 'none',
            }}>
              <PlusIcon /> New Project
            </Link>
          </div>
        ) : view === 'kanban' ? (
          /* ── Kanban View ──────────────────────────────────────── */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', alignItems: 'flex-start' }}>
            {KANBAN_COLS.map(col => {
              const colProjects = projects.filter(p => col.phases.includes(p.phase || 'initiation'))
              return (
                <div key={col.key}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '0 4px',
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#2D3E50', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{col.label}</span>
                    <span style={{
                      fontSize: '11px', fontWeight: 700, padding: '1px 8px', borderRadius: '10px',
                      background: '#E8EEF4', color: '#5B7080',
                    }}>{colProjects.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {colProjects.map(p => <ProjectCard key={p.id} p={p} />)}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* ── Table View ───────────────────────────────────────── */
          <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-manrope)' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  <SortHead label="Title" field="title" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortHead label="Client" field="client_company" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortHead label="Event Date" field="event_date" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#5B7080', borderBottom: '1px solid #DDE8EE' }}>Format</th>
                  <SortHead label="Phase" field="phase" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortHead label="Registrations" field="registrations" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortHead label="Commercial Lead" field="lead" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortHead label="Days Left" field="days_left" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map(p => {
                  const days = daysLeft(p.event_date)
                  const pc = PHASE_COLORS[p.phase] || PHASE_COLORS.initiation
                  const fc = FORMAT_COLORS[p.format] || FORMAT_COLORS.physical
                  return (
                    <tr key={p.id}
                      onClick={() => window.location.href = `/admin/bespoke/${p.id}`}
                      style={{ cursor: 'pointer', borderBottom: '1px solid #F0F4F8', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px', fontSize: '14px', fontWeight: 700, color: '#0F1923' }}>{p.title}</td>
                      <td style={{ padding: '12px', fontSize: '14px', color: '#2D3E50' }}>{p.client_company}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#5B7080' }}>{fmtDate(p.event_date)}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: fc.bg, color: fc.fg }}>{p.format}</span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: pc.bg, color: pc.fg }}>{PHASE_LABELS[p.phase] || p.phase}</span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <ProgressBar value={p.delegate_stats.registered} max={p.target_delegate_count} height={5} />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F1923', whiteSpace: 'nowrap' }}>{p.delegate_stats.registered}/{p.target_delegate_count}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#2D3E50' }}>{p.commercial_lead?.name || '--'}</td>
                      <td style={{ padding: '12px' }}>
                        {days !== null ? (
                          <span style={{ fontSize: '13px', fontWeight: 700, color: days <= 7 ? '#DC2626' : days <= 14 ? '#B45309' : '#2D3E50' }}>
                            {days > 0 ? `${days}d` : days === 0 ? 'Today' : `${Math.abs(days)}d ago`}
                          </span>
                        ) : '--'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
