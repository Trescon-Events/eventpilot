'use client'

import { useState, useEffect, use } from 'react'

/* Speaker Communications (2026-09-10) — a speaker lands here from a
   "Request Missing Items" email with a personal, single-use link, and
   uploads just whatever was asked for (Full Bio, Photo, Passport,
   National ID). Modeled directly on
   app/public/announcement-review/[id]/[announcementId]/page.tsx — same
   token-in-URL pattern, same server-side status check on every load so
   reopening the link after submitting always shows a permanent "already
   submitted" state instead of the form again (the lock is
   review-data/route.ts's status !== 'pending' check, read fresh every
   time — no client-side flag to get out of sync). */

type ReviewData = {
  speaker_name: string | null
  event_name: string | null
  status: 'pending' | 'submitted' | 'closed'
  submitted_at: string | null
  requested_fields: { key: string; label: string }[]
}

const PAGE_STYLES = `
  .ss-shell { min-height: 100vh; background: var(--surface); padding: clamp(20px, 6vw, 48px) clamp(14px, 4vw, 20px); font-family: var(--font-manrope), Manrope, sans-serif; box-sizing: border-box; }
  .ss-wrap { max-width: 640px; margin: 0 auto; width: 100%; }
  .ss-title { font-size: clamp(22px, 5vw, 28px); font-weight: 900; color: var(--ink); margin: 0 0 6px; line-height: 1.2; }
  .ss-event { font-size: clamp(14px, 3.4vw, 16px); color: var(--ink3); }
  .ss-card { background: var(--card); border: 1px solid var(--border); border-radius: clamp(12px, 3vw, 18px); padding: clamp(18px, 4.5vw, 32px); display: grid; gap: clamp(16px, 4vw, 22px); box-sizing: border-box; margin-top: 20px; }
  .ss-item-label { font-size: clamp(13px, 3vw, 14px); font-weight: 800; color: var(--ink); margin-bottom: 8px; }
  .ss-file-input { width: 100%; box-sizing: border-box; font-size: clamp(13px, 3.2vw, 14px); border: 1px dashed var(--border); border-radius: 10px; padding: 12px; background: var(--surface2); }
  .ss-submit { padding: 15px 24px; border-radius: 12px; border: none; background: var(--lime); color: var(--lime-dark); font-size: clamp(14.5px, 3.6vw, 16px); font-weight: 800; cursor: pointer; font-family: inherit; width: 100%; }
`

const ACCEPT: Record<string, string> = {
  bio_full: 'application/pdf,.doc,.docx',
  photo: 'image/jpeg,image/png,image/webp',
  passport: 'application/pdf,image/jpeg,image/png,image/webp',
  national_id: 'application/pdf,image/jpeg,image/png,image/webp',
}

export default function SpeakerSubmissionPage({ params }: { params: Promise<{ speakerId: string }> }) {
  const { speakerId } = use(params)
  const [token] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('token')
  })

  const [data, setData] = useState<ReviewData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(() => token ? null : 'This link is missing a valid token.')
  const [files, setFiles] = useState<Record<string, File | null>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/public/speaker-submission/${speakerId}/review-data?token=${token}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not load this request.'); return r.json() })
      .then(setData)
      .catch(e => setLoadError(e.message))
  }, [speakerId, token])

  async function submit() {
    const hasAny = Object.values(files).some(f => f)
    if (!hasAny) { setSubmitError('Please add at least one file before submitting.'); return }
    setSubmitting(true); setSubmitError(null)
    const form = new FormData()
    for (const [key, file] of Object.entries(files)) if (file) form.append(key, file)
    const res = await fetch(`/api/public/speaker-submission/${speakerId}/submit?token=${token}`, { method: 'POST', body: form })
    const result = await res.json().catch(() => ({}))
    if (res.ok) setDone(true)
    else setSubmitError(result.error || 'Could not submit — please try again.')
    setSubmitting(false)
  }

  if (loadError) return <Centered><p style={{ color: 'var(--red)' }}>{loadError}</p></Centered>
  if (!data) return <Centered><p style={{ color: 'var(--ink3)' }}>Loading…</p></Centered>
  if (done) {
    return (
      <Centered>
        <div style={{ fontSize: 'clamp(30px, 8vw, 36px)', marginBottom: '10px' }}>✓</div>
        <h1 style={{ fontSize: 'clamp(18px, 4.5vw, 22px)', fontWeight: 900, color: 'var(--ink)', margin: '0 0 10px' }}>Thank you!</h1>
        <p style={{ color: 'var(--ink3)', fontSize: 'clamp(13.5px, 3.4vw, 15px)' }}>Your details have been submitted for review. Our team will be in touch if anything else is needed.</p>
      </Centered>
    )
  }
  // Already submitted by the time this page loaded — reopening the same
  // link (or a later re-visit) always shows this, never the form again.
  if (data.status !== 'pending') {
    return (
      <Centered>
        <div style={{ fontSize: 'clamp(30px, 8vw, 36px)', marginBottom: '10px' }}>✓</div>
        <h1 style={{ fontSize: 'clamp(18px, 4.5vw, 22px)', fontWeight: 900, color: 'var(--ink)', margin: '0 0 10px' }}>Already submitted</h1>
        <p style={{ color: 'var(--ink2)', fontSize: 'clamp(14px, 3.6vw, 16px)', lineHeight: 1.5 }}>
          Thank you — your details{data.submitted_at ? ` were submitted on ${new Date(data.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : ' have already been submitted'} and are with our team for review.
        </p>
        <p style={{ color: 'var(--ink4)', fontSize: 'clamp(12.5px, 3vw, 13.5px)', marginTop: '16px' }}>No action needed from you.</p>
      </Centered>
    )
  }

  return (
    <div className="ss-shell">
      <style>{PAGE_STYLES}</style>
      <div className="ss-wrap">
        <h1 className="ss-title">A Quick Follow-Up</h1>
        <div className="ss-event">{data.event_name}</div>

        <div className="ss-card">
          <div style={{ fontSize: 'clamp(13.5px, 3.4vw, 15px)', color: 'var(--ink2)', lineHeight: 1.6 }}>
            Dear {data.speaker_name ?? 'Speaker'}, to finish setting up your speaker profile we still need the following from you:
          </div>

          {data.requested_fields.map(f => (
            <div key={f.key}>
              <div className="ss-item-label">{f.label}</div>
              <input
                type="file"
                accept={ACCEPT[f.key] ?? undefined}
                className="ss-file-input"
                onChange={e => setFiles(prev => ({ ...prev, [f.key]: e.target.files?.[0] ?? null }))}
              />
            </div>
          ))}

          {submitError && (
            <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: 'clamp(13px, 3.2vw, 14px)' }}>
              {submitError}
            </div>
          )}

          <button onClick={submit} disabled={submitting} className="ss-submit" style={{ opacity: submitting ? 0.5 : 1 }}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
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
