'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import NavBar, { MOD_EVENTPILOT, ProfileMenu } from '@/app/components/NavBar'

// ── Constants ────────────────────────────────────────────────────────────────

const TOOLS: Record<string, string> = {
  events:          'Events Hub',
  hr_portal:       'HR Portal',
  smart_data:      'Smart Data',
  brand_studio:    'Brand Studio',
  website_builder: 'Website Builder',
  content:         'Content Engine',
  intelligence:    'Intelligence Reports',
  finance:         'Finance',
  other:           'Other / General',
}

const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  bug:         { label: 'Bug',         color: '#EF4444', bg: '#EF444415' },
  not_working: { label: 'Not Working', color: '#F97316', bg: '#F9731615' },
  suggestion:  { label: 'Suggestion',  color: '#3B82F6', bg: '#3B82F615' },
  improvement: { label: 'Improvement', color: '#8B5CF6', bg: '#8B5CF615' },
}

const SEVERITY_META: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: '#EF4444', bg: '#EF444415' },
  high:     { label: 'High',     color: '#F97316', bg: '#F9731615' },
  medium:   { label: 'Medium',   color: '#F59E0B', bg: '#F59E0B15' },
  low:      { label: 'Low',      color: '#22C55E', bg: '#22C55E15' },
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; next?: string }> = {
  new:          { label: 'New',           color: '#EF4444', bg: '#EF444415' },
  acknowledged: { label: 'Acknowledged',  color: '#F59E0B', bg: '#F59E0B15' },
  in_progress:  { label: 'In Progress',   color: '#3B82F6', bg: '#3B82F615' },
  resolved:     { label: 'Resolved',      color: '#22C55E', bg: '#22C55E15' },
  wont_fix:     { label: "Won't Fix",     color: '#64748B', bg: '#64748B15' },
}

const STATUS_FLOW = ['new', 'acknowledged', 'in_progress', 'resolved', 'wont_fix']

type Review = {
  id: string; staff_id: string | null; staff_name: string; staff_email: string
  tool: string; review_type: string; severity: string; title: string
  description: string; status: string; admin_notes: string | null
  resolved_at: string | null; resolved_by_name: string | null
  created_at: string; updated_at: string
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Badge({ meta }: { meta: { label: string; color: string; bg: string } }) {
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', background: meta.bg, color: meta.color, whiteSpace: 'nowrap' as const }}>
      {meta.label}
    </span>
  )
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 2)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)   return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// ── Review card ───────────────────────────────────────────────────────────────

function ReviewCard({ review, onUpdate }: {
  review:   Review
  onUpdate: (id: string, patch: { status?: string; admin_notes?: string }) => void
}) {
  const [expanded,   setExpanded]   = useState(false)
  const [notes,      setNotes]      = useState(review.admin_notes ?? '')
  const [saving,     setSaving]     = useState(false)
  const [saveMsg,    setSaveMsg]    = useState('')

  const typeMeta     = TYPE_META[review.review_type]     ?? { label: review.review_type, color: '#64748B', bg: '#64748B15' }
  const severityMeta = SEVERITY_META[review.severity]    ?? { label: review.severity,    color: '#64748B', bg: '#64748B15' }
  const statusMeta   = STATUS_META[review.status]        ?? { label: review.status,      color: '#64748B', bg: '#64748B15' }

  async function changeStatus(newStatus: string) {
    setSaving(true)
    const res  = await fetch(`/api/reviews/${review.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    setSaving(false)
    if (res.ok) onUpdate(review.id, { status: newStatus })
  }

  async function saveNotes() {
    setSaving(true)
    const res = await fetch(`/api/reviews/${review.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_notes: notes }),
    })
    setSaving(false)
    if (res.ok) {
      onUpdate(review.id, { admin_notes: notes })
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(''), 2000)
    }
  }

  return (
    <div style={{
      background: '#0E1520', border: `1px solid ${review.status === 'new' ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: '14px', overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Card header — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none',
          padding: '16px 18px', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          {/* Left col — badges */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0, minWidth: '90px' }}>
            <Badge meta={typeMeta} />
            <Badge meta={severityMeta} />
          </div>

          {/* Centre — title + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9', marginBottom: '4px', lineHeight: 1.35 }}>
              {review.title}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: '12px', color: '#00A5A3', fontWeight: 600 }}>
                {TOOLS[review.tool] ?? review.tool}
              </span>
              <span style={{ fontSize: '11px', color: '#475569' }}>·</span>
              <span style={{ fontSize: '12px', color: '#475569' }}>{review.staff_name}</span>
              <span style={{ fontSize: '11px', color: '#475569' }}>·</span>
              <span style={{ fontSize: '12px', color: '#475569' }}>{timeAgo(review.created_at)}</span>
            </div>
          </div>

          {/* Right — status + chevron */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <Badge meta={statusMeta} />
            <svg width="14" height="14" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s', flexShrink: 0 }}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>

          {/* Description */}
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '6px' }}>Description</div>
            <div style={{ fontSize: '14px', color: '#CBD5E1', lineHeight: 1.7, whiteSpace: 'pre-wrap' as const, background: 'rgba(255,255,255,0.02)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
              {review.description}
            </div>
          </div>

          {/* Staff info */}
          <div style={{ display: 'flex', gap: '24px', marginTop: '14px', flexWrap: 'wrap' as const }}>
            <div>
              <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600, marginBottom: '2px' }}>Reported by</div>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>{review.staff_name} · {review.staff_email}</div>
            </div>
            {review.resolved_at && (
              <div>
                <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600, marginBottom: '2px' }}>Resolved</div>
                <div style={{ fontSize: '13px', color: '#94A3B8' }}>
                  {new Date(review.resolved_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {review.resolved_by_name && ` by ${review.resolved_by_name}`}
                </div>
              </div>
            )}
          </div>

          {/* Status change */}
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '8px' }}>Change Status</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
              {STATUS_FLOW.map(st => {
                const m = STATUS_META[st]
                const active = review.status === st
                return (
                  <button key={st} onClick={() => !active && changeStatus(st)} disabled={active || saving}
                    style={{
                      padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                      cursor: active ? 'default' : 'pointer', fontFamily: 'inherit',
                      background: active ? m.bg : 'rgba(255,255,255,0.03)',
                      color: active ? m.color : '#475569',
                      border: `1px solid ${active ? m.color + '60' : 'rgba(255,255,255,0.08)'}`,
                      transition: 'all 0.15s',
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Admin notes */}
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '8px' }}>Admin Notes</div>
            <textarea
              rows={3} value={notes}
              onChange={e => { setNotes(e.target.value); setSaveMsg('') }}
              placeholder="Internal notes — what's the plan, any workaround, linked PR or fix…"
              style={{
                width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#E2E8F0',
                outline: 'none', fontFamily: 'inherit', resize: 'vertical' as const, minHeight: '72px',
                boxSizing: 'border-box' as const, lineHeight: 1.6,
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
              <button onClick={saveNotes} disabled={saving}
                style={{
                  background: '#00A5A3', color: '#fff', border: 'none', borderRadius: '8px',
                  padding: '7px 18px', fontSize: '13px', fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
                }}>
                {saving ? 'Saving…' : 'Save Notes'}
              </button>
              {saveMsg && <span style={{ fontSize: '12px', color: '#22C55E', fontWeight: 600 }}>{saveMsg}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminReviewsPage() {
  const [reviews,    setReviews]    = useState<Review[]>([])
  const [loading,    setLoading]    = useState(true)
  const [filterTool,     setFilterTool]     = useState('all')
  const [filterType,     setFilterType]     = useState('all')
  const [filterStatus,   setFilterStatus]   = useState('all')
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [search, setSearch] = useState('')

  const fetchReviews = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterTool     !== 'all') params.set('tool',     filterTool)
    if (filterType     !== 'all') params.set('type',     filterType)
    if (filterStatus   !== 'all') params.set('status',   filterStatus)
    if (filterSeverity !== 'all') params.set('severity', filterSeverity)
    const res = await fetch(`/api/reviews?${params}`)
    const data = await res.json()
    setReviews(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filterTool, filterType, filterStatus, filterSeverity])

  useEffect(() => { fetchReviews() }, [fetchReviews])

  function handleUpdate(id: string, patch: { status?: string; admin_notes?: string }) {
    setReviews(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  // Client-side search filter
  const displayed = reviews.filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return r.title.toLowerCase().includes(q)
      || r.description.toLowerCase().includes(q)
      || r.staff_name.toLowerCase().includes(q)
      || (TOOLS[r.tool] ?? r.tool).toLowerCase().includes(q)
  })

  // Stats
  const stats = {
    new:         reviews.filter(r => r.status === 'new').length,
    acknowledged:reviews.filter(r => r.status === 'acknowledged').length,
    in_progress: reviews.filter(r => r.status === 'in_progress').length,
    resolved:    reviews.filter(r => r.status === 'resolved').length,
    critical:    reviews.filter(r => r.severity === 'critical').length,
  }

  const selectStyle: React.CSSProperties = {
    background: '#0E1520', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '9px', padding: '8px 12px', fontSize: '13px', color: '#CBD5E1',
    outline: 'none', cursor: 'pointer', fontFamily: 'inherit',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080A0B' }}>
      <NavBar
        module={MOD_EVENTPILOT}
        subtitle="Platform Reviews"
        rightSlot={<ProfileMenu />}
      />

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 20px' }}>

        {/* Back link */}
        <Link href="/admin" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#475569', textDecoration: 'none', marginBottom: '24px', fontWeight: 600 }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Admin
        </Link>

        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#F1F5F9', margin: 0 }}>Platform Reviews</h1>
          <p style={{ fontSize: '14px', color: '#475569', marginTop: '6px' }}>
            Staff feedback on platform tools — issues, bugs, and suggestions.
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '28px' }}>
          {[
            { label: 'New',          value: stats.new,          color: '#EF4444', action: () => setFilterStatus('new')         },
            { label: 'Acknowledged', value: stats.acknowledged,  color: '#F59E0B', action: () => setFilterStatus('acknowledged') },
            { label: 'In Progress',  value: stats.in_progress,   color: '#3B82F6', action: () => setFilterStatus('in_progress')  },
            { label: 'Resolved',     value: stats.resolved,      color: '#22C55E', action: () => setFilterStatus('resolved')     },
            { label: 'Critical',     value: stats.critical,      color: '#EF4444', action: () => setFilterSeverity('critical')   },
          ].map(s => (
            <button key={s.label} onClick={s.action}
              style={{
                background: '#0E1520', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '12px', padding: '14px 16px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'border-color 0.15s',
              }}
              onMouseOver={e => e.currentTarget.style.borderColor = s.color + '40'}
              onMouseOut={e  => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'}
            >
              <div style={{ fontSize: '26px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px', fontWeight: 600 }}>{s.label}</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#0E1520', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', padding: '8px 12px', flex: 1, minWidth: '200px' }}>
            <svg width="14" height="14" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" viewBox="0 0 20 20">
              <circle cx="8.5" cy="8.5" r="5.5"/><path d="M13 13l4 4"/>
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search reviews…"
              style={{ background: 'none', border: 'none', outline: 'none', fontSize: '13px', color: '#E2E8F0', fontFamily: 'inherit', width: '100%' }}
            />
          </div>

          <select value={filterTool}     onChange={e => setFilterTool(e.target.value)}     style={selectStyle}>
            <option value="all">All Tools</option>
            {Object.entries(TOOLS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          <select value={filterType}     onChange={e => setFilterType(e.target.value)}     style={selectStyle}>
            <option value="all">All Types</option>
            {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <select value={filterStatus}   onChange={e => setFilterStatus(e.target.value)}   style={selectStyle}>
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} style={selectStyle}>
            <option value="all">All Severities</option>
            {Object.entries(SEVERITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          {(filterTool !== 'all' || filterType !== 'all' || filterStatus !== 'all' || filterSeverity !== 'all' || search) && (
            <button onClick={() => { setFilterTool('all'); setFilterType('all'); setFilterStatus('all'); setFilterSeverity('all'); setSearch('') }}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', padding: '8px 14px', fontSize: '12px', color: '#EF4444', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
              Clear
            </button>
          )}
        </div>

        {/* Result count */}
        <div style={{ fontSize: '13px', color: '#475569', marginBottom: '14px', fontWeight: 600 }}>
          {loading ? 'Loading…' : `${displayed.length} review${displayed.length !== 1 ? 's' : ''}`}
        </div>

        {/* Reviews list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#475569', fontSize: '14px' }}>Loading reviews…</div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <svg width="22" height="22" fill="none" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#64748B' }}>No reviews found</div>
            <div style={{ fontSize: '13px', color: '#334155', marginTop: '4px' }}>Try adjusting your filters</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {displayed.map(review => (
              <ReviewCard key={review.id} review={review} onUpdate={handleUpdate} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
