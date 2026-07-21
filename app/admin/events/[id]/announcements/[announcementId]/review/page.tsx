'use client'

import { useState, useEffect, use } from 'react'

type ReviewData = {
  event_name: string | null; sent_by: string | null; sent_at: string | null
  approver_name: string | null; approver_role: string; approval_status: string
  post_copy: string | null; creative_url: string | null
  platforms: string[] | null; scheduled_for: string | null; announcement_status: string
}

const DECISIONS = [
  { value: 'approved', label: '✓ Approve' },
  { value: 'approved_with_comments', label: '✓ Approve with Comments' },
  { value: 'changes_requested', label: '✗ Request Changes' },
] as const

export default function AnnouncementReviewPage({ params }: { params: Promise<{ id: string; announcementId: string }> }) {
  const { announcementId } = use(params)
  // Matches app/admin/page.tsx's established pattern — avoids useSearchParams()
  // and the Suspense-boundary requirement it brings.
  const [token] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('token')
  })

  const [data, setData] = useState<ReviewData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(() => token ? null : 'This link is missing a valid token.')
  const [decision, setDecision] = useState<typeof DECISIONS[number]['value'] | null>(null)
  const [comments, setComments] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/events/stakeholders/announcements/${announcementId}/review-data?token=${token}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not load this approval request.'); return r.json() })
      .then(setData)
      .catch(e => setLoadError(e.message))
  }, [announcementId, token])

  async function submit() {
    if (!decision) return
    setSubmitting(true)
    setSubmitError(null)
    const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, status: decision, comments: comments.trim() || undefined }),
    })
    const result = await res.json().catch(() => ({}))
    if (res.ok) setDone(true)
    else setSubmitError(result.error || 'Could not submit your decision — please try again.')
    setSubmitting(false)
  }

  if (loadError) return <Centered><p style={{ color: 'var(--red)' }}>{loadError}</p></Centered>
  if (!data) return <Centered><p style={{ color: 'var(--ink3)' }}>Loading…</p></Centered>
  if (done || data.approval_status !== 'pending') {
    return (
      <Centered>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
        <h1 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 8px' }}>Decision recorded</h1>
        <p style={{ color: 'var(--ink3)', fontSize: '14px' }}>Thank you — your decision has been recorded and the team has been notified.</p>
      </Centered>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', padding: '48px 20px', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 4px' }}>Approval Request</h1>
          <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{data.event_name}</div>
          <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '2px' }}>
            Sent by {data.sent_by ?? 'the Marketing Manager'}{data.sent_at ? ` on ${new Date(data.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
          </div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', display: 'grid', gap: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: data.creative_url ? '200px 1fr' : '1fr', gap: '18px' }}>
            {data.creative_url && (
              <img src={data.creative_url} alt="Announcement creative" style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--border-light)' }} />
            )}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>Post Copy</div>
              <div style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{data.post_copy ?? '(no copy)'}</div>
              {data.platforms && data.platforms.length > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '10px' }}>Platforms: {data.platforms.join(', ')}</div>
              )}
              <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '4px' }}>
                {data.scheduled_for ? `Scheduled for ${new Date(data.scheduled_for).toLocaleString()}` : 'Not yet scheduled'}
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' }}>Your Decision</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {DECISIONS.map(d => (
                <button key={d.value} onClick={() => setDecision(d.value)}
                  style={{
                    padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    border: decision === d.value ? '1.5px solid var(--teal-mid)' : '1.5px solid var(--border)',
                    background: decision === d.value ? 'var(--teal-light)' : 'transparent',
                    color: decision === d.value ? 'var(--teal)' : 'var(--ink2)',
                  }}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>
              Comments {decision === 'changes_requested' && <span style={{ color: 'var(--red)' }}>*</span>}
            </label>
            <textarea rows={4} value={comments} onChange={e => setComments(e.target.value)} className="tfield" style={{ resize: 'vertical' }} />
          </div>

          {submitError && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12.5px' }}>
              {submitError}
            </div>
          )}

          <button onClick={submit} disabled={!decision || submitting || (decision === 'changes_requested' && !comments.trim())}
            style={{ padding: '12px 20px', borderRadius: '10px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: (!decision || submitting) ? 0.5 : 1 }}>
            {submitting ? 'Submitting…' : 'Submit Decision'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
      <div style={{ maxWidth: '440px', textAlign: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '36px' }}>
        {children}
      </div>
    </div>
  )
}
