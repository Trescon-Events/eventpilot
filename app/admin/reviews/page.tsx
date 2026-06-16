'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import NavBar, { MOD_EVENTPILOT, ProfileMenu } from '@/app/components/NavBar'

const C = {
  bg:      '#F6F8FB',
  surface: '#FFFFFF',
  border:  '#DDE8EE',
  text:    '#0F1923',
  muted:   '#5B7080',
  teal:    '#00897B',
}

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
  bug:         { label: 'Bug',         color: '#DC2626', bg: '#DC262615' },
  not_working: { label: 'Not Working', color: '#EA580C', bg: '#EA580C15' },
  suggestion:  { label: 'Suggestion',  color: '#1565C0', bg: '#1565C015' },
  improvement: { label: 'Improvement', color: '#6B21A8', bg: '#6B21A815' },
}

const SEVERITY_META: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: '#DC2626', bg: '#DC262615' },
  high:     { label: 'High',     color: '#EA580C', bg: '#EA580C15' },
  medium:   { label: 'Medium',   color: '#D97706', bg: '#D9770615' },
  low:      { label: 'Low',      color: '#059669', bg: '#05966915' },
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new:          { label: 'New',          color: '#DC2626', bg: '#DC262615' },
  acknowledged: { label: 'Acknowledged', color: '#D97706', bg: '#D9770615' },
  in_progress:  { label: 'In Progress',  color: '#1565C0', bg: '#1565C015' },
  resolved:     { label: 'Resolved',     color: '#059669', bg: '#05966915' },
  wont_fix:     { label: "Won't Fix",    color: '#5B7080', bg: '#5B708015' },
}

const STATUS_FLOW = ['new', 'acknowledged', 'in_progress', 'resolved', 'wont_fix']

type ReviewComment = {
  id: string; review_id: string; author_type: 'admin' | 'staff'
  author_name: string; message: string | null
  is_status_change: boolean; new_status: string | null; created_at: string
}

type Review = {
  id: string; staff_id: string | null; staff_name: string; staff_email: string
  tool: string; review_type: string; severity: string; title: string
  description: string; status: string; admin_notes: string | null
  screenshot_url: string | null
  resolved_at: string | null; resolved_by_name: string | null
  created_at: string; updated_at: string
  comments?: ReviewComment[]
}

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
  if (m < 2)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// ── Reply Modal ───────────────────────────────────────────────────────────────

function ReplyModal({ review, onClose, onUpdate }: {
  review:   Review
  onClose:  () => void
  onUpdate: (id: string, patch: { status?: string; comments?: ReviewComment[] }) => void
}) {
  const [comments,  setComments]  = useState<ReviewComment[]>([])
  const [loading,   setLoading]   = useState(true)
  const [response,  setResponse]  = useState('')
  const [sending,   setSending]   = useState(false)
  const [sendError, setSendError] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/reviews/${review.id}`)
      .then(r => r.json())
      .then(d => setComments(d.comments ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [review.id])

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [comments])

  async function sendReply() {
    if (!response.trim() || sending) return
    const msg = response.trim()
    setResponse('')
    setSendError('')
    setSending(true)

    const optimistic: ReviewComment = {
      id: `opt-${Date.now()}`, review_id: review.id,
      author_type: 'admin', author_name: 'You',
      message: msg, is_status_change: false, new_status: null,
      created_at: new Date().toISOString(),
    }
    setComments(prev => [...prev, optimistic])

    const res  = await fetch(`/api/reviews/${review.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: msg }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.comments) {
      setComments(data.comments)
      onUpdate(review.id, { comments: data.comments })
    } else {
      setComments(prev => prev.filter(c => !c.id.startsWith('opt-')))
      setResponse(msg)
      setSendError(data.error ?? 'Send failed — try again')
    }
    setSending(false)
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply() }
  }

  const typeMeta = TYPE_META[review.review_type] ?? { label: review.review_type, color: C.muted, bg: '#eee' }
  const sevMeta  = SEVERITY_META[review.severity] ?? { label: review.severity, color: C.muted, bg: '#eee' }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,35,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div style={{ background: C.surface, borderRadius: '16px', width: '100%', maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>

        {/* Modal header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <Badge meta={typeMeta} />
                <Badge meta={sevMeta} />
                <Badge meta={STATUS_META[review.status] ?? { label: review.status, color: C.muted, bg: '#eee' }} />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: C.text, lineHeight: 1.3 }}>{review.title}</div>
              <div style={{ fontSize: '12px', color: C.muted, marginTop: '4px' }}>
                <span style={{ fontWeight: 700, color: C.teal }}>{TOOLS[review.tool] ?? review.tool}</span>
                {' · '}{review.staff_name}{' · '}{timeAgo(review.created_at)}
              </div>
            </div>
            <button onClick={onClose} style={{ background: '#F1F5F9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* Thread */}
        <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Original description as first message */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '11px', color: C.muted, marginBottom: '4px', fontWeight: 600 }}>
              <span style={{ fontWeight: 700, color: C.text }}>{review.staff_name}</span>{' · '}{timeAgo(review.created_at)}
            </div>
            <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: '2px 12px 12px 12px', background: '#F1F5F9', color: C.text, fontSize: '14px', lineHeight: 1.65, whiteSpace: 'pre-wrap' as const }}>
              {review.description}
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '16px', fontSize: '13px', color: C.muted }}>Loading messages…</div>
          ) : comments.map(c => {
            if (c.is_status_change) {
              const sm = c.new_status ? STATUS_META[c.new_status] : null
              return (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: sm?.bg ?? '#F1F5F9', border: `1px solid ${(sm?.color ?? C.border) + '40'}`, borderRadius: '20px', padding: '3px 12px' }}>
                    <svg width="9" height="9" fill="none" stroke={sm?.color ?? C.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: sm?.color ?? C.muted }}>
                      {c.author_name} marked as {STATUS_META[c.new_status ?? '']?.label ?? c.new_status}
                    </span>
                    <span style={{ fontSize: '11px', color: C.muted }}>· {timeAgo(c.created_at)}</span>
                  </div>
                </div>
              )
            }
            const isAdmin      = c.author_type === 'admin'
            const isOptimistic = c.id.startsWith('opt-')
            return (
              <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isAdmin ? 'flex-end' : 'flex-start' }}>
                <div style={{ fontSize: '11px', color: C.muted, marginBottom: '4px', fontWeight: 600 }}>
                  {isAdmin
                    ? <><span style={{ color: C.teal, fontWeight: 700 }}>{c.author_name}</span>{' · '}{timeAgo(c.created_at)}</>
                    : <><span style={{ color: C.text, fontWeight: 700 }}>{c.author_name}</span>{' · '}{timeAgo(c.created_at)}</>
                  }
                </div>
                <div style={{
                  maxWidth: '80%', padding: '10px 14px',
                  borderRadius: isAdmin ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                  background: isAdmin ? C.teal : '#F1F5F9',
                  color: isAdmin ? '#FFFFFF' : C.text,
                  fontSize: '14px', lineHeight: 1.65, whiteSpace: 'pre-wrap' as const,
                  opacity: isOptimistic ? 0.65 : 1,
                }}>
                  {c.message}
                </div>
                {isOptimistic && <div style={{ fontSize: '10px', color: C.muted, marginTop: '3px' }}>Sending…</div>}
              </div>
            )
          })}
        </div>

        {/* Reply box */}
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 20px 16px', flexShrink: 0, background: C.surface }}>
          {sendError && (
            <div style={{ fontSize: '12px', color: '#DC2626', fontWeight: 600, marginBottom: '8px' }}>{sendError}</div>
          )}
          <textarea
            rows={3}
            value={response}
            onChange={e => { setResponse(e.target.value); setSendError('') }}
            onKeyDown={handleKey}
            placeholder={`Reply to ${review.staff_name}…  (Cmd+Enter to send)`}
            style={{ width: '100%', background: '#F6F8FB', border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: C.text, outline: 'none', fontFamily: 'inherit', resize: 'none' as const, boxSizing: 'border-box' as const, lineHeight: 1.6 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
            <span style={{ fontSize: '11px', color: C.muted }}>Visible to {review.staff_name} · bell notification sent on reply</span>
            <button
              onClick={sendReply}
              disabled={sending || !response.trim()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px',
                background: response.trim() && !sending ? C.teal : '#E8EEF4',
                color: response.trim() && !sending ? '#FFFFFF' : C.muted,
                border: 'none', borderRadius: '9px', padding: '9px 20px',
                fontSize: '14px', fontWeight: 700, cursor: sending || !response.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'background 0.15s',
              }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              {sending ? 'Sending…' : 'Send Reply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Review Card ───────────────────────────────────────────────────────────────

function ReviewCard({ review, onReply, onUpdate }: {
  review:   Review
  onReply:  (review: Review) => void
  onUpdate: (id: string, patch: { status?: string; admin_notes?: string; comments?: ReviewComment[] }) => void
}) {
  const [expanded,    setExpanded]    = useState(false)
  const [notes,       setNotes]       = useState(review.admin_notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesMsg,    setNotesMsg]    = useState('')

  const typeMeta     = TYPE_META[review.review_type]  ?? { label: review.review_type, color: C.muted, bg: C.muted + '15' }
  const severityMeta = SEVERITY_META[review.severity] ?? { label: review.severity,    color: C.muted, bg: C.muted + '15' }
  const statusMeta   = STATUS_META[review.status]     ?? { label: review.status,      color: C.muted, bg: C.muted + '15' }

  async function changeStatus(newStatus: string) {
    const res  = await fetch(`/api/reviews/${review.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) onUpdate(review.id, { status: newStatus, comments: data.comments })
  }

  async function saveNotes() {
    setSavingNotes(true)
    const res  = await fetch(`/api/reviews/${review.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_notes: notes }),
    })
    const data = await res.json().catch(() => ({}))
    setSavingNotes(false)
    if (res.ok) {
      onUpdate(review.id, { admin_notes: notes })
      setNotesMsg('Saved')
      setTimeout(() => setNotesMsg(''), 2500)
    } else {
      setNotesMsg(`Error: ${data.error ?? 'Failed'}`)
    }
  }

  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${review.status === 'new' ? '#DC262630' : C.border}`,
      borderRadius: '14px', overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0, minWidth: '90px' }}>
          <Badge meta={typeMeta} />
          <Badge meta={severityMeta} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: C.text, marginBottom: '4px', lineHeight: 1.35 }}>{review.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const }}>
            <span style={{ fontSize: '12px', color: C.teal, fontWeight: 600 }}>{TOOLS[review.tool] ?? review.tool}</span>
            <span style={{ fontSize: '11px', color: C.border }}>·</span>
            <span style={{ fontSize: '12px', color: C.muted }}>{review.staff_name}</span>
            <span style={{ fontSize: '11px', color: C.border }}>·</span>
            <span style={{ fontSize: '12px', color: C.muted }}>{timeAgo(review.created_at)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* Reply button */}
          <button
            onClick={() => onReply(review)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: C.teal, color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Reply
          </button>
          <Badge meta={statusMeta} />
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
          >
            <svg width="14" height="14" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '0 18px 18px' }}>

          {/* Description */}
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, letterSpacing: '0.8px', textTransform: 'uppercase' as const, marginBottom: '6px' }}>Description</div>
            <div style={{ fontSize: '14px', color: C.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' as const, background: '#F6F8FB', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${C.border}` }}>
              {review.description}
            </div>
          </div>

          {/* Screenshot */}
          {review.screenshot_url && (
            <div style={{ marginTop: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, letterSpacing: '0.8px', textTransform: 'uppercase' as const, marginBottom: '8px' }}>Screenshot</div>
              <a href={review.screenshot_url} target="_blank" rel="noopener noreferrer">
                <img src={review.screenshot_url} alt="screenshot"
                  style={{ maxWidth: '100%', maxHeight: '260px', objectFit: 'contain', borderRadius: '10px', border: `1px solid ${C.border}`, display: 'block', cursor: 'zoom-in' }}
                />
              </a>
              <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>Click to open full size</div>
            </div>
          )}

          {/* Staff info */}
          <div style={{ display: 'flex', gap: '24px', marginTop: '14px', flexWrap: 'wrap' as const }}>
            <div>
              <div style={{ fontSize: '11px', color: C.muted, fontWeight: 600, marginBottom: '2px' }}>Reported by</div>
              <div style={{ fontSize: '13px', color: C.text }}>{review.staff_name} · {review.staff_email}</div>
            </div>
            {review.resolved_at && (
              <div>
                <div style={{ fontSize: '11px', color: C.muted, fontWeight: 600, marginBottom: '2px' }}>Resolved</div>
                <div style={{ fontSize: '13px', color: C.text }}>
                  {new Date(review.resolved_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {review.resolved_by_name && ` by ${review.resolved_by_name}`}
                </div>
              </div>
            )}
          </div>

          {/* Status change */}
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, letterSpacing: '0.8px', textTransform: 'uppercase' as const, marginBottom: '8px' }}>Change Status</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
              {STATUS_FLOW.map(st => {
                const m = STATUS_META[st]; const active = review.status === st
                return (
                  <button key={st} onClick={() => !active && changeStatus(st)} disabled={active}
                    style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: active ? 'default' : 'pointer', fontFamily: 'inherit', background: active ? m.bg : C.surface, color: active ? m.color : C.muted, border: `1px solid ${active ? m.color + '60' : C.border}`, transition: 'all 0.15s' }}>
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Admin notes */}
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, letterSpacing: '0.8px', textTransform: 'uppercase' as const, marginBottom: '8px' }}>
              Admin Notes <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0 }}>— internal only</span>
            </div>
            <textarea
              rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes — not visible to staff"
              style={{ width: '100%', background: '#F6F8FB', border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: C.text, outline: 'none', fontFamily: 'inherit', resize: 'vertical' as const, minHeight: '72px', boxSizing: 'border-box' as const, lineHeight: 1.6 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
              <button onClick={saveNotes} disabled={savingNotes}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: notesMsg === 'Saved' ? '#059669' : '#E8EEF4', color: notesMsg === 'Saved' ? '#FFFFFF' : C.text, border: `1px solid ${notesMsg === 'Saved' ? '#059669' : C.border}`, borderRadius: '8px', padding: '7px 18px', fontSize: '13px', fontWeight: 700, cursor: savingNotes ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: savingNotes ? 0.6 : 1, transition: 'all 0.2s' }}>
                {savingNotes ? 'Saving…' : notesMsg === 'Saved'
                  ? <><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Saved</>
                  : 'Save Notes'}
              </button>
              {notesMsg && notesMsg !== 'Saved' && <span style={{ fontSize: '12px', color: '#DC2626', fontWeight: 600 }}>{notesMsg}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: '9px', padding: '8px 12px', fontSize: '13px', color: C.text,
  outline: 'none', cursor: 'pointer', fontFamily: 'inherit',
}

export default function AdminReviewsPage() {
  const [reviews,        setReviews]        = useState<Review[]>([])
  const [loading,        setLoading]        = useState(true)
  const [filterTool,     setFilterTool]     = useState('all')
  const [filterType,     setFilterType]     = useState('all')
  const [filterStatus,   setFilterStatus]   = useState('all')
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [search,         setSearch]         = useState('')
  const [replyReview,    setReplyReview]    = useState<Review | null>(null)

  const fetchReviews = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterTool     !== 'all') params.set('tool',     filterTool)
    if (filterType     !== 'all') params.set('type',     filterType)
    if (filterStatus   !== 'all') params.set('status',   filterStatus)
    if (filterSeverity !== 'all') params.set('severity', filterSeverity)
    const res  = await fetch(`/api/reviews?${params}`)
    const data = await res.json()
    setReviews(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filterTool, filterType, filterStatus, filterSeverity])

  useEffect(() => { fetchReviews() }, [fetchReviews])

  function handleUpdate(id: string, patch: { status?: string; admin_notes?: string; comments?: ReviewComment[] }) {
    setReviews(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
    // keep modal review in sync
    setReplyReview(prev => prev?.id === id ? { ...prev, ...patch } : prev)
  }

  const displayed = reviews.filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return r.title.toLowerCase().includes(q)
      || r.description.toLowerCase().includes(q)
      || r.staff_name.toLowerCase().includes(q)
      || (TOOLS[r.tool] ?? r.tool).toLowerCase().includes(q)
  })

  const stats = {
    new:          reviews.filter(r => r.status === 'new').length,
    acknowledged: reviews.filter(r => r.status === 'acknowledged').length,
    in_progress:  reviews.filter(r => r.status === 'in_progress').length,
    resolved:     reviews.filter(r => r.status === 'resolved').length,
    critical:     reviews.filter(r => r.severity === 'critical').length,
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <NavBar module={MOD_EVENTPILOT} subtitle="Platform Reviews" rightSlot={<ProfileMenu />} />

      {replyReview && (
        <ReplyModal
          review={replyReview}
          onClose={() => setReplyReview(null)}
          onUpdate={handleUpdate}
        />
      )}

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 20px' }}>

        <Link href="/admin" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: C.muted, textDecoration: 'none', marginBottom: '24px', fontWeight: 600 }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Admin
        </Link>

        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 900, color: C.text, margin: 0 }}>Platform Reviews</h1>
          <p style={{ fontSize: '14px', color: C.muted, marginTop: '6px' }}>Staff feedback on platform tools — issues, bugs, and suggestions.</p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '28px' }}>
          {[
            { label: 'New',          value: stats.new,         color: '#DC2626', action: () => setFilterStatus('new')         },
            { label: 'Acknowledged', value: stats.acknowledged, color: '#D97706', action: () => setFilterStatus('acknowledged') },
            { label: 'In Progress',  value: stats.in_progress,  color: '#1565C0', action: () => setFilterStatus('in_progress')  },
            { label: 'Resolved',     value: stats.resolved,     color: '#059669', action: () => setFilterStatus('resolved')     },
            { label: 'Critical',     value: stats.critical,     color: '#DC2626', action: () => setFilterSeverity('critical')   },
          ].map(s => (
            <button key={s.label} onClick={s.action}
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px 16px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '28px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '12px', color: C.muted, marginTop: '4px', fontWeight: 600 }}>{s.label}</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const, marginBottom: '20px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '9px', padding: '8px 12px', flex: 1, minWidth: '200px' }}>
            <svg width="14" height="14" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M13 13l4 4"/></svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reviews…"
              style={{ background: 'none', border: 'none', outline: 'none', fontSize: '13px', color: C.text, fontFamily: 'inherit', width: '100%' }} />
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
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '9px', padding: '8px 14px', fontSize: '12px', color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
              Clear
            </button>
          )}
        </div>

        <div style={{ fontSize: '13px', color: C.muted, marginBottom: '14px', fontWeight: 600 }}>
          {loading ? 'Loading…' : `${displayed.length} review${displayed.length !== 1 ? 's' : ''}`}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted, fontSize: '14px' }}>Loading reviews…</div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: C.muted }}>No reviews found</div>
            <div style={{ fontSize: '13px', color: C.muted, marginTop: '4px' }}>Try adjusting your filters</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {displayed.map(review => (
              <ReviewCard key={review.id} review={review} onReply={setReplyReview} onUpdate={handleUpdate} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
