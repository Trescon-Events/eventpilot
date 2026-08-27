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

   Fully responsive (2026-08-27, per Madhu — "high profile" recipients,
   phone is the realistic primary device for opening an email link) —
   deliberately built to stay responsive as this page's content grows, not
   just fixed for today's fields:
   - A real CSS stylesheet (this component's own <style> tag, not inline
     px styles) with actual breakpoints, so layout genuinely reflows
     rather than just shrinking.
   - Fluid type via clamp() everywhere instead of one fixed px per
     breakpoint — text scales continuously across the whole viewport
     range, not just at specific stops, so a new device size or a longer
     heading later doesn't need a new breakpoint added.
   - CSS Grid with auto-fit/minmax for the creative+copy layout — it
     naturally stacks below the point where 2 columns no longer fit
     (governed by content width, not a hardcoded viewport number), so
     adding a 3rd item or changing the image size later doesn't break it.
   - Buttons/inputs use relative sizing and wrap naturally; nothing is
     pinned to an absolute px width that could overflow a narrow screen. */

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

// Rendered once via a plain <style> tag (no styled-jsx dependency) —
// class-based rules here are the only way to get real media-query
// behavior; inline style objects can't respond to viewport size at all.
const PAGE_STYLES = `
  .rv-shell { min-height: 100vh; background: var(--surface); padding: clamp(20px, 6vw, 48px) clamp(14px, 4vw, 20px); font-family: var(--font-manrope), Manrope, sans-serif; box-sizing: border-box; }
  .rv-wrap { max-width: 820px; margin: 0 auto; width: 100%; }
  .rv-title { font-size: clamp(22px, 5vw, 28px); font-weight: 900; color: var(--ink); margin: 0 0 6px; line-height: 1.2; }
  .rv-event { font-size: clamp(14px, 3.4vw, 16px); color: var(--ink3); }
  .rv-meta { font-size: clamp(12.5px, 3vw, 14px); color: var(--ink4); margin-top: 4px; }
  .rv-card { background: var(--card); border: 1px solid var(--border); border-radius: clamp(12px, 3vw, 18px); padding: clamp(18px, 4.5vw, 32px); display: grid; gap: clamp(18px, 4vw, 26px); box-sizing: border-box; }
  .rv-media-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: clamp(16px, 4vw, 28px); align-items: start; }
  .rv-media-grid.rv-no-image { grid-template-columns: 1fr; }
  .rv-image-btn { padding: 0; border: 1px solid var(--border-light); border-radius: 12px; cursor: zoom-in; background: none; overflow: hidden; display: block; width: 100%; max-width: 320px; }
  .rv-image-btn img { width: 100%; display: block; }
  .rv-label { font-size: clamp(12px, 2.8vw, 13px); font-weight: 800; color: var(--ink3); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 10px; }
  .rv-copy { font-size: clamp(15px, 3.6vw, 17px); color: var(--ink2); line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
  .rv-sub { font-size: clamp(12.5px, 3vw, 14px); color: var(--ink4); margin-top: 16px; }
  .rv-decisions { display: flex; gap: 10px; flex-wrap: wrap; }
  .rv-decision-btn { padding: 12px 18px; border-radius: 12px; font-size: clamp(13.5px, 3.2vw, 15px); font-weight: 700; cursor: pointer; font-family: inherit; flex: 1 1 auto; min-width: 140px; }
  .rv-textarea { width: 100%; box-sizing: border-box; font-size: clamp(14px, 3.4vw, 15px); }
  .rv-submit { padding: 15px 24px; border-radius: 12px; border: none; background: var(--lime); color: var(--lime-dark); font-size: clamp(14.5px, 3.6vw, 16px); font-weight: 800; cursor: pointer; font-family: inherit; width: 100%; }
  @media (max-width: 480px) {
    .rv-decision-btn { min-width: 100%; }
  }
`

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
        <div style={{ fontSize: 'clamp(30px, 8vw, 36px)', marginBottom: '10px' }}>✓</div>
        <h1 style={{ fontSize: 'clamp(18px, 4.5vw, 22px)', fontWeight: 900, color: 'var(--ink)', margin: '0 0 10px' }}>Decision recorded</h1>
        <p style={{ color: 'var(--ink3)', fontSize: 'clamp(13.5px, 3.4vw, 15px)' }}>Thank you — your decision has been recorded and the team has been notified.</p>
      </Centered>
    )
  }

  return (
    <div className="rv-shell">
      <style>{PAGE_STYLES}</style>
      <div className="rv-wrap">
        <div style={{ marginBottom: '24px' }}>
          <h1 className="rv-title">Approval Request</h1>
          <div className="rv-event">{data.event_name}</div>
          <div className="rv-meta">
            Sent by {data.sent_by ?? 'the team'}{data.sent_at ? ` on ${new Date(data.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
          </div>
        </div>

        <div className="rv-card">
          <div className={`rv-media-grid${data.creative_url ? '' : ' rv-no-image'}`}>
            {data.creative_url && (
              <button onClick={() => setLightboxOpen(true)} title="Click to enlarge" className="rv-image-btn">
                <img src={data.creative_url} alt="Announcement creative" />
              </button>
            )}
            <div>
              <div className="rv-label">Post Copy</div>
              <div className="rv-copy">{data.post_copy ?? '(no copy)'}</div>
              {data.platforms && data.platforms.length > 0 && (
                <div className="rv-sub">Platforms: {data.platforms.join(', ')}</div>
              )}
              <div className="rv-sub" style={{ marginTop: '4px' }}>
                {data.scheduled_for ? `Scheduled for ${new Date(data.scheduled_for).toLocaleString()}` : 'Not yet scheduled'}
              </div>
            </div>
          </div>

          <div>
            <div className="rv-label">Your Decision</div>
            <div className="rv-decisions">
              {DECISIONS.map(d => (
                <button key={d.value} onClick={() => setDecision(d.value)} className="rv-decision-btn"
                  style={{
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
            <label style={{ fontSize: 'clamp(12.5px, 3vw, 13px)', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '6px' }}>
              Comments {decision === 'changes_requested' && <span style={{ color: 'var(--red)' }}>*</span>}
            </label>
            <textarea rows={5} value={comments} onChange={e => setComments(e.target.value)} className="tfield rv-textarea" style={{ resize: 'vertical' }} />
          </div>

          {submitError && (
            <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: 'clamp(13px, 3.2vw, 14px)' }}>
              {submitError}
            </div>
          )}

          <button onClick={submit} disabled={!decision || submitting || (decision === 'changes_requested' && !comments.trim())} className="rv-submit"
            style={{ opacity: (!decision || submitting) ? 0.5 : 1 }}>
            {submitting ? 'Submitting…' : 'Submit Decision'}
          </button>
        </div>
      </div>

      {lightboxOpen && data.creative_url && (
        <div onClick={() => setLightboxOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,20,0.88)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', cursor: 'zoom-out' }}>
          <img src={data.creative_url} alt="Announcement creative — enlarged" style={{ maxWidth: '94vw', maxHeight: '90vh', borderRadius: '10px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} />
          <button onClick={() => setLightboxOpen(false)} aria-label="Close"
            style={{ position: 'fixed', top: 'max(16px, env(safe-area-inset-top))', right: 'max(16px, env(safe-area-inset-right))', width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: '20px', cursor: 'pointer' }}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(16px, 5vw, 20px)', fontFamily: 'var(--font-manrope), Manrope, sans-serif', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '460px', width: '100%', textAlign: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'clamp(14px, 4vw, 18px)', padding: 'clamp(28px, 6vw, 40px)', boxSizing: 'border-box' }}>
        {children}
      </div>
    </div>
  )
}
