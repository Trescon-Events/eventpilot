'use client'

import { useState, useEffect, use } from 'react'

/* Moved here from app/admin/events/[id]/announcements/[announcementId]/review
   (2026-08-27) — that location nests under app/admin/events/[id]/layout.tsx,
   which does its own server-side "must have a session" redirect on every
   route beneath it with no awareness of this page's token-based public
   access. middleware.ts's own regex exemption for the old path was
   correct but couldn't override that layout, since the layout redirects
   before middleware's decision is even relevant — a real bug Madhu hit
   live (an external reviewer with no EventPilot account got bounced to
   /login). Living under /public instead — already a blanket-public
   prefix in middleware.ts, same family as the SAE onboarding forms — sidesteps
   the problem entirely rather than patching around the admin layout.
   Old links already sent (e.g. any test send before this fix) will 404;
   nothing else depends on the old path.

   Same dark theme as before (CSS vars from the root layout, unchanged) —
   only the type scale/spacing got bigger and the creative got a click-to-
   enlarge lightbox, per Madhu's "make the content bigger... they are
   reviewing the text" + "make the image clickable" feedback. */

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
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/events/stakeholders/announcements/${announcementId}/review-data?token=${token}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not load this approval request.'); return r.json() })
      .then(setData)
      .catch(e => setLoadError(e.message))
  }, [announcementId, token])

  // Esc to close the lightbox — matches ordinary image-viewer expectations.
  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen])

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
        <div style={{ fontSize: '36px', marginBottom: '10px' }}>✓</div>
        <h1 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 10px' }}>Decision recorded</h1>
        <p style={{ color: 'var(--ink3)', fontSize: '15px' }}>Thank you — your decision has been recorded and the team has been notified.</p>
      </Centered>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', padding: '48px 20px', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
      <div style={{ maxWidth: '820px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 6px' }}>Approval Request</h1>
          <div style={{ fontSize: '16px', color: 'var(--ink3)' }}>{data.event_name}</div>
          <div style={{ fontSize: '14px', color: 'var(--ink4)', marginTop: '4px' }}>
            Sent by {data.sent_by ?? 'the team'}{data.sent_at ? ` on ${new Date(data.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
          </div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '32px', display: 'grid', gap: '26px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: data.creative_url ? '280px 1fr' : '1fr', gap: '28px', alignItems: 'start' }}>
            {data.creative_url && (
              <button onClick={() => setLightboxOpen(true)} title="Click to enlarge"
                style={{ padding: 0, border: '1px solid var(--border-light)', borderRadius: '12px', cursor: 'zoom-in', background: 'none', overflow: 'hidden', display: 'block', width: '100%' }}>
                <img src={data.creative_url} alt="Announcement creative" style={{ width: '100%', display: 'block' }} />
              </button>
            )}
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '10px' }}>Post Copy</div>
              <div style={{ fontSize: '17px', color: 'var(--ink2)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{data.post_copy ?? '(no copy)'}</div>
              {data.platforms && data.platforms.length > 0 && (
                <div style={{ fontSize: '14px', color: 'var(--ink4)', marginTop: '16px' }}>Platforms: {data.platforms.join(', ')}</div>
              )}
              <div style={{ fontSize: '14px', color: 'var(--ink4)', marginTop: '4px' }}>
                {data.scheduled_for ? `Scheduled for ${new Date(data.scheduled_for).toLocaleString()}` : 'Not yet scheduled'}
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '10px' }}>Your Decision</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {DECISIONS.map(d => (
                <button key={d.value} onClick={() => setDecision(d.value)}
                  style={{
                    padding: '12px 20px', borderRadius: '12px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    border: decision === d.value ? '2px solid var(--teal-mid)' : '2px solid var(--border)',
                    background: decision === d.value ? 'var(--teal-light)' : 'transparent',
                    color: decision === d.value ? 'var(--teal)' : 'var(--ink2)',
                  }}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '6px' }}>
              Comments {decision === 'changes_requested' && <span style={{ color: 'var(--red)' }}>*</span>}
            </label>
            <textarea rows={5} value={comments} onChange={e => setComments(e.target.value)} className="tfield"
              style={{ resize: 'vertical', fontSize: '15px', width: '100%', boxSizing: 'border-box' }} />
          </div>

          {submitError && (
            <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '14px' }}>
              {submitError}
            </div>
          )}

          <button onClick={submit} disabled={!decision || submitting || (decision === 'changes_requested' && !comments.trim())}
            style={{ padding: '15px 24px', borderRadius: '12px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '16px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: (!decision || submitting) ? 0.5 : 1 }}>
            {submitting ? 'Submitting…' : 'Submit Decision'}
          </button>
        </div>
      </div>

      {lightboxOpen && data.creative_url && (
        <div onClick={() => setLightboxOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,20,0.88)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px', cursor: 'zoom-out' }}>
          <img src={data.creative_url} alt="Announcement creative — enlarged" style={{ maxWidth: '92vw', maxHeight: '92vh', borderRadius: '10px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} />
          <button onClick={() => setLightboxOpen(false)} aria-label="Close"
            style={{ position: 'fixed', top: '24px', right: '28px', width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: '20px', cursor: 'pointer' }}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
      <div style={{ maxWidth: '460px', textAlign: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '40px' }}>
        {children}
      </div>
    </div>
  )
}
