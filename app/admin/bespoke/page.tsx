'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { computeBespokePhase, BESPOKE_PHASES, type BespokePhaseNum } from '@/app/lib/bespoke-phase'

type DelegateStats = { total: number; registered: number; attended: number }

type BespokeProject = {
  id: string
  title: string
  client_company: string
  format: string
  event_date: string | null
  contract_signed_date: string | null
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

// Static DB-value fallback (used when contract_signed_date is missing so
// computeBespokePhase() returns null) — keeps legacy phase column meaningful
// on rows that predate the dynamic-date model.
const PHASE_STATIC_LABELS: Record<string, string> = {
  initiation: 'Kickoff & Alignment',
  campaign: 'Outreach Runway',
  live: 'Live Execution',
  closure: 'Reporting & Settlement',
  completed: 'Reporting & Settlement',
}
const PHASE_STATIC_TO_NUM: Record<string, BespokePhaseNum> = {
  initiation: 1, campaign: 2, live: 3, closure: 4, completed: 4,
}

const FORMAT_COLORS: Record<string, { bg: string; fg: string }> = {
  physical: { bg: 'var(--success-light)', fg: 'var(--success)' },
  virtual: { bg: 'var(--info-light)', fg: 'var(--info)' },
  hybrid: { bg: 'var(--purple-light)', fg: 'var(--purple)' },
}

// Kanban columns: one per phase, derived from the shared helper so labels /
// colors stay in lockstep with the single-event dashboard. Filtering is done
// dynamically in getProjectPhaseNum() below — no static DB-column matching.
const KANBAN_COLS: Array<{ num: BespokePhaseNum; label: string; color: string }> = BESPOKE_PHASES.map(p => ({
  num: p.num, label: p.label, color: p.color,
}))

function daysLeft(eventDate: string | null): number | null {
  if (!eventDate) return null
  const diff = Math.ceil((new Date(eventDate).getTime() - Date.now()) / 86400000)
  return diff
}

// Resolve a project to a phase number for Kanban column placement. Prefers
// the dynamic date-based computation (contract_signed_date + event_date);
// falls back to the legacy DB `phase` column when dates are missing.
function getProjectPhaseNum(p: BespokeProject): BespokePhaseNum {
  const dyn = computeBespokePhase(p.contract_signed_date, p.event_date)
  if (dyn) return dyn.activePhase
  return PHASE_STATIC_TO_NUM[p.phase] ?? 1
}

function fmtDate(d: string | null): string {
  if (!d) return '--'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
    <svg width="16" height="16" fill={active ? 'var(--teal)' : 'var(--ink3)'} viewBox="0 0 24 24">
      <rect x="2" y="3" width="6" height="18" rx="1" /><rect x="9" y="3" width="6" height="12" rx="1" /><rect x="16" y="3" width="6" height="15" rx="1" />
    </svg>
  )
}
function TableIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" fill="none" stroke={active ? 'var(--teal)' : 'var(--ink3)'} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

/* ── Progress Bar ──────────────────────────────────────────────── */
function ProgressBar({ value, max, height = 6 }: { value: number; max: number; height?: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{ height, background: 'var(--surface)', borderRadius: height / 2, overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--teal)' : '#F5B94D', borderRadius: height / 2, transition: 'width 0.4s ease' }} />
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
        background: 'var(--card)', borderRadius: '10px', padding: '16px', border: '1px solid var(--border)',
        cursor: 'pointer', transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.borderColor = '#F5B94D' }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        {/* Title + Format */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
          <div style={{ fontFamily: 'var(--font-manrope)', fontWeight: 700, fontSize: '15px', color: 'var(--ink)', lineHeight: '1.3' }}>{p.title}</div>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: fmtC.bg, color: fmtC.fg, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {p.format}
          </span>
        </div>

        {/* Client */}
        <div style={{ fontSize: '13px', color: 'var(--ink3)', fontWeight: 500, marginBottom: '10px' }}>{p.client_company}</div>

        {/* Event date + Days left — concluded events show a neutral "Concluded"
             badge (never a negative day count). Nic 490f6974. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>{fmtDate(p.event_date)}</span>
          {days !== null && (
            days < 0 ? (
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', background: 'var(--surface)', padding: '2px 8px', borderRadius: '6px' }}>Concluded</span>
            ) : (
              <span style={{ fontSize: '11px', fontWeight: 700, color: days <= 7 ? 'var(--red)' : days <= 14 ? '#F5B94D' : 'var(--ink3)' }}>
                {days > 0 ? `${days}d left` : 'Today'}
              </span>
            )
          )}
        </div>

        {/* Registration progress */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', color: 'var(--ink3)', fontWeight: 600 }}>Registrations</span>
            <span style={{ fontSize: '11px', color: 'var(--ink)', fontWeight: 700 }}>{p.delegate_stats.registered} / {p.target_delegate_count}</span>
          </div>
          <ProgressBar value={p.delegate_stats.registered} max={p.target_delegate_count} />
        </div>

        {/* Commercial lead */}
        {p.commercial_lead && (
          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '8px' }}>
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
      style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: active ? 'var(--teal)' : 'var(--ink3)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}
    >
      {label} {active ? (sortDir === 'asc' ? '↑' : '↓') : ''}
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
      <div style={{ minHeight: '100vh', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '15px', color: 'var(--ink3)', fontFamily: 'var(--font-manrope)', fontWeight: 600 }}>Loading bespoke projects...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'var(--font-manrope)' }}>
      <PageHeader
        title="Bespoke Tracker"
        description={`${projects.length} project${projects.length !== 1 ? 's' : ''}`}
        actions={
          <>
            <Link href="/admin/bespoke/new" style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', borderRadius: '8px',
              background: '#F5B94D', color: 'var(--amber-light)', fontSize: '14px', fontWeight: 700, textDecoration: 'none',
              transition: 'background 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--amber-border)')}
              onMouseLeave={e => (e.currentTarget.style.background = '#F5B94D')}
            >
              <PlusIcon /> New Project
            </Link>
            <Link href="/admin/bespoke/settings" title="Settings"
              style={{ width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', border: '1px solid var(--ink4)', background: 'var(--card)', color: 'var(--ink3)', flexShrink: 0 }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </Link>
          </>
        }
      />

      {/* ── View Toggle Bar ─────────────────────────────────────── */}
      <div style={{ padding: '16px 32px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button onClick={() => setView('kanban')} style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px',
          border: view === 'kanban' ? '2px solid var(--teal)' : '1px solid var(--ink4)', background: view === 'kanban' ? 'var(--teal-light)' : 'var(--card)',
          fontSize: '13px', fontWeight: 700, color: view === 'kanban' ? 'var(--teal)' : 'var(--ink3)', cursor: 'pointer',
        }}>
          <KanbanIcon active={view === 'kanban'} /> Kanban
        </button>
        <button onClick={() => setView('table')} style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px',
          border: view === 'table' ? '2px solid var(--teal)' : '1px solid var(--ink4)', background: view === 'table' ? 'var(--teal-light)' : 'var(--card)',
          fontSize: '13px', fontWeight: 700, color: view === 'table' ? 'var(--teal)' : 'var(--ink3)', cursor: 'pointer',
        }}>
          <TableIcon active={view === 'table'} /> Table
        </button>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div style={{ padding: '20px 32px 48px' }}>
        {projects.length === 0 ? (
          /* Empty State */
          <div style={{
            background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '64px 32px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', color: 'var(--ink4)' }}>
              <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ color: 'var(--ink4)' }}>
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" />
              </svg>
            </div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px' }}>No bespoke projects yet</div>
            <div style={{ fontSize: '15px', color: 'var(--ink3)', marginBottom: '24px' }}>Create your first one.</div>
            <Link href="/admin/bespoke/new" style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '8px',
              background: '#F5B94D', color: 'var(--amber-light)', fontSize: '14px', fontWeight: 700, textDecoration: 'none',
            }}>
              <PlusIcon /> New Project
            </Link>
          </div>
        ) : view === 'kanban' ? (
          /* ── Kanban View — dynamic column placement per Nic 490f6974
             (and subsumes f071291c). Each project is placed based on its
             computed phase from contract_signed_date + event_date, not the
             legacy static DB `phase` column. Concluded events automatically
             render under Reporting & Settlement. ──────────────────────── */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', alignItems: 'flex-start' }}>
            {KANBAN_COLS.map(col => {
              const colProjects = projects.filter(p => getProjectPhaseNum(p) === col.num)
              return (
                <div key={col.num}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '0 4px',
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{col.label}</span>
                    <span style={{
                      fontSize: '11px', fontWeight: 700, padding: '1px 8px', borderRadius: '10px',
                      background: 'var(--surface)', color: 'var(--ink3)',
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
          <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-manrope)' }}>
              <thead>
                <tr style={{ background: 'var(--border-light)' }}>
                  <SortHead label="Title" field="title" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortHead label="Client" field="client_company" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortHead label="Event Date" field="event_date" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>Format</th>
                  <SortHead label="Phase" field="phase" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortHead label="Registrations" field="registrations" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortHead label="Commercial Lead" field="lead" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortHead label="Days Left" field="days_left" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map(p => {
                  const days = daysLeft(p.event_date)
                  // Prefer dynamic phase for row-level pill; fall back to
                  // static DB label if dates missing. Colors from shared helper.
                  const dyn = computeBespokePhase(p.contract_signed_date, p.event_date)
                  const phaseLabel = dyn ? dyn.label : (PHASE_STATIC_LABELS[p.phase] || p.phase)
                  const phaseColor = dyn ? dyn.color   : (BESPOKE_PHASES[(PHASE_STATIC_TO_NUM[p.phase] ?? 1) - 1].color)
                  const phaseBg    = dyn ? dyn.bgColor : (BESPOKE_PHASES[(PHASE_STATIC_TO_NUM[p.phase] ?? 1) - 1].bgColor)
                  const fc = FORMAT_COLORS[p.format] || FORMAT_COLORS.physical
                  return (
                    <tr key={p.id}
                      onClick={() => window.location.href = `/admin/bespoke/${p.id}`}
                      style={{ cursor: 'pointer', borderBottom: '1px solid var(--surface)', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--border-light)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px', fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{p.title}</td>
                      <td style={{ padding: '12px', fontSize: '14px', color: 'var(--ink2)' }}>{p.client_company}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: 'var(--ink3)' }}>{fmtDate(p.event_date)}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: fc.bg, color: fc.fg }}>{p.format}</span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: phaseBg, color: phaseColor }}>{phaseLabel}</span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <ProgressBar value={p.delegate_stats.registered} max={p.target_delegate_count} height={5} />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{p.delegate_stats.registered}/{p.target_delegate_count}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px', fontSize: '13px', color: 'var(--ink2)' }}>{p.commercial_lead?.name || '--'}</td>
                      <td style={{ padding: '12px' }}>
                        {days === null ? '--' : days < 0 ? (
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)' }}>Concluded</span>
                        ) : (
                          <span style={{ fontSize: '13px', fontWeight: 700, color: days <= 7 ? 'var(--red)' : days <= 14 ? '#F5B94D' : 'var(--ink2)' }}>
                            {days > 0 ? `${days}d` : 'Today'}
                          </span>
                        )}
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
