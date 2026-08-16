'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Button } from '@/app/components/ui'

/* Internal approvals inbox (2026-08-16) — the counterpart to the external,
   token-based review page (app/admin/events/[id]/announcements/
   [announcementId]/review/page.tsx) for staff members who ARE logged into
   EventPilot: everything currently pending THEIR decision, across every
   event, reusing the exact same POST .../approve route the external page
   calls, just with approver_id (this session's staff id) instead of a
   signed token. Global rather than per-event, deliberately — a real
   approval inbox shows everything assigned to you, not filtered by
   whichever event you happen to have open. */

type PendingApproval = {
  id: string
  approver_role: string
  notified_at: string | null
  announcement: {
    id: string; post_copy: string | null; creative_url: string | null; status: string; scheduled_for: string | null
    event: { id: string; name: string } | { id: string; name: string }[] | null
  } | { id: string; post_copy: string | null; creative_url: string | null; status: string; scheduled_for: string | null; event: unknown }[] | null
}

const DECISIONS = [
  { value: 'approved', label: '✓ Approve' },
  { value: 'approved_with_comments', label: '✓ Approve with Comments' },
  { value: 'changes_requested', label: '✗ Request Changes' },
] as const
type Decision = typeof DECISIONS[number]['value']

export default function MyApprovalsPage() {
  const [items, setItems] = useState<PendingApproval[]>([])
  const [staffId, setStaffId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [comments, setComments] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function fetchAll() {
    setLoading(true)
    const res = await fetch('/api/staff/my-approvals')
    const data = await res.json().catch(() => [])
    if (res.ok) { setItems(Array.isArray(data) ? data : []); setLoadError(null) }
    else setLoadError(data.error || 'Could not load your approvals.')
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => setStaffId(s?.sid ?? null)).catch(() => setStaffId(null))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches this app's other top-level fetchAll effects
    fetchAll()
  }, [])

  function openDecision(id: string) {
    setOpenId(id)
    setDecision(null)
    setComments('')
  }

  async function submit(approvalId: string, announcementId: string) {
    if (!decision || !staffId) return
    setSubmitting(true)
    setMsg(null)
    const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approver_id: staffId, status: decision, comments: comments.trim() || undefined }),
    })
    const data = await res.json().catch(() => ({}))
    setSubmitting(false)
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== approvalId))
      setOpenId(null)
    } else setMsg(data.error || 'Could not submit your decision.')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Stakeholder Announcement Engine"
        title="My Approvals"
        description="Announcements waiting on your review before they can be scheduled or posted."
      />
      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '28px 32px' }}>
        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '13.5px', marginBottom: '16px' }}>
            {msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
          </div>
        )}
        {loading ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
        ) : loadError ? (
          <div style={{ color: 'var(--red)', fontSize: '13px' }}>{loadError}</div>
        ) : items.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13.5px', padding: '32px 0', textAlign: 'center' }}>Nothing waiting on you right now.</div>
        ) : (
          <div style={{ display: 'grid', gap: '14px' }}>
            {items.map(item => {
              const ann = Array.isArray(item.announcement) ? item.announcement[0] : item.announcement
              if (!ann) return null
              const event = Array.isArray(ann.event) ? ann.event[0] : ann.event as { id: string; name: string } | null
              const isOpen = openId === item.id
              return (
                <div key={item.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: ann.creative_url ? '120px 1fr' : '1fr', gap: '16px' }}>
                    {ann.creative_url && (
                      // eslint-disable-next-line @next/next/no-img-element -- reviewing a remote-storage creative, not worth next/image's remote-loader config here
                      <img src={ann.creative_url} alt="Announcement creative" style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                    )}
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{event?.name ?? 'Unknown event'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ink4)', marginBottom: '6px' }}>As {item.approver_role}{item.notified_at ? ` · sent ${new Date(item.notified_at).toLocaleDateString()}` : ''}</div>
                      <div style={{ fontSize: '12.5px', color: 'var(--ink2)', lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: isOpen ? 'none' : '4.5em', overflow: 'hidden' }}>
                        {ann.post_copy ?? '(no copy)'}
                      </div>
                      {event && (
                        <Link href={`/admin/events/${event.id}/creative-templates`} style={{ fontSize: '11.5px', color: 'var(--teal-mid)', display: 'inline-block', marginTop: '6px' }}>
                          Open in Creative Templates →
                        </Link>
                      )}
                    </div>
                  </div>

                  {!isOpen ? (
                    <div style={{ marginTop: '14px' }}>
                      <Button variant="ghost" onClick={() => openDecision(item.id)}>Review</Button>
                    </div>
                  ) : (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                        {DECISIONS.map(d => (
                          <button key={d.value} onClick={() => setDecision(d.value)}
                            style={{
                              padding: '8px 14px', borderRadius: '9px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                              border: decision === d.value ? '1.5px solid var(--teal-mid)' : '1.5px solid var(--border)',
                              background: decision === d.value ? 'var(--teal-light)' : 'transparent',
                              color: decision === d.value ? 'var(--teal)' : 'var(--ink2)',
                            }}>
                            {d.label}
                          </button>
                        ))}
                      </div>
                      <textarea rows={3} value={comments} onChange={e => setComments(e.target.value)} className="tfield"
                        placeholder={decision === 'changes_requested' ? 'What needs to change? (required)' : 'Optional comments'}
                        style={{ resize: 'vertical', width: '100%', marginBottom: '12px' }} />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button variant="lime" onClick={() => submit(item.id, ann.id)} disabled={!decision || !staffId || submitting || (decision === 'changes_requested' && !comments.trim())}>
                          {submitting ? 'Submitting…' : 'Submit Decision'}
                        </Button>
                        <Button variant="ghost" onClick={() => setOpenId(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
