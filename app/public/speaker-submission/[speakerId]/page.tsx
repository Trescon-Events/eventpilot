'use client'

import { useState, useEffect, use } from 'react'
import { HUBSPOT_COUNTRIES } from '@/app/lib/forms/hubspot-countries'

/* Speaker Communications (2026-09-10, redesigned 2026-09-24) — a speaker
   lands here from a "Request Missing Items" email with a personal,
   single-use link, and fills in just whatever was asked for. Modeled
   directly on app/public/announcement-review/[id]/[announcementId]/page.tsx
   — same token-in-URL pattern, same server-side status check on every load
   so reopening the link after submitting always shows a permanent "already
   submitted" state instead of the form again (the lock is review-data/
   route.ts's status !== 'pending' check, read fresh every time — no
   client-side flag to get out of sync).

   Two-section redesign (2026-09-24, per Madhu, real feedback from testing
   this himself as "John Travis (TEST)"):
   - Section 1, "Your Speaker Profile" — Photo/Full Bio/Short Bio/Country,
     field constraints and help text mirrored from the DFS HubSpot speaker
     onboarding form (fetched live via the Forms v3 API — see
     app/lib/forms/hubspot-countries.ts's own comment for the exact form
     id), so a speaker who already filled that form sees familiar,
     consistent guidance here.
   - Section 2, "Speaker License Requirements" — Passport (+ National ID
     for UAE residents). The "Are you a UAE resident?" question only
     appears when review-data's is_uae_resident is genuinely null (never
     re-asks a speaker whose record already has an answer) — answering it
     immediately reveals exactly the document(s) needed, client-side, no
     extra round trip. */

type ReviewData = {
  speaker_name: string | null
  event_name: string | null
  status: 'pending' | 'submitted' | 'closed'
  submitted_at: string | null
  requested_fields: { key: string; label: string }[]
  current_short_bio: string
  current_country: string
  is_uae_resident: boolean | null
}

const PROFILE_KEYS = ['photo', 'bio_full', 'short_bio', 'country']
const LICENSE_KEYS = ['passport', 'national_id']
const MAX_SHORT_BIO_CHARS = 500

const PAGE_STYLES = `
  .ss-shell { min-height: 100vh; background: var(--surface); padding: clamp(20px, 6vw, 48px) clamp(14px, 4vw, 20px); font-family: var(--font-manrope), Manrope, sans-serif; box-sizing: border-box; }
  .ss-wrap { max-width: 640px; margin: 0 auto; width: 100%; }
  .ss-title { font-size: clamp(22px, 5vw, 28px); font-weight: 900; color: var(--ink); margin: 0 0 6px; line-height: 1.2; }
  .ss-event { font-size: clamp(14px, 3.4vw, 16px); color: var(--ink3); }
  .ss-card { background: var(--card); border: 1px solid var(--border); border-radius: clamp(12px, 3vw, 18px); padding: clamp(18px, 4.5vw, 32px); display: grid; gap: clamp(16px, 4vw, 22px); box-sizing: border-box; margin-top: 20px; }
  .ss-section-title { font-size: clamp(15px, 3.6vw, 17px); font-weight: 900; color: var(--ink); margin: 0; }
  .ss-section-sub { font-size: clamp(12.5px, 3vw, 13.5px); color: var(--ink4); margin-top: 4px; }
  .ss-field { display: grid; gap: 6px; }
  .ss-item-label { font-size: clamp(13px, 3vw, 14px); font-weight: 800; color: var(--ink); }
  .ss-help { font-size: clamp(11.5px, 2.8vw, 12.5px); color: var(--ink4); line-height: 1.5; }
  .ss-file-input { width: 100%; box-sizing: border-box; font-size: clamp(13px, 3.2vw, 14px); color: var(--ink3); border: 1px dashed var(--border); border-radius: 10px; padding: 10px 12px; background: var(--surface2); display: flex; align-items: center; }
  .ss-file-input::file-selector-button { margin-right: 12px; padding: 8px 14px; border-radius: 8px; border: none; background: var(--ink2); color: var(--surface); font-weight: 700; font-size: 12.5px; font-family: inherit; cursor: pointer; }
  .ss-textarea { width: 100%; box-sizing: border-box; font-size: clamp(13px, 3.2vw, 14px); border: 1px solid var(--border); border-radius: 10px; padding: 12px; background: var(--surface2); color: var(--ink); font-family: inherit; resize: vertical; min-height: 90px; }
  .ss-select { width: 100%; box-sizing: border-box; font-size: clamp(13px, 3.2vw, 14px); border: 1px solid var(--border); border-radius: 10px; padding: 12px; background: var(--surface2); color: var(--ink); font-family: inherit; }
  .ss-charcount { font-size: 11.5px; color: var(--ink4); text-align: right; }
  .ss-charcount.over { color: var(--red); font-weight: 700; }
  .ss-radio-row { display: flex; gap: 10px; }
  .ss-radio-btn { flex: 1; padding: 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface2); color: var(--ink2); font-weight: 700; font-size: 13.5px; font-family: inherit; cursor: pointer; text-align: center; }
  .ss-radio-btn.active { border-color: var(--lime); background: var(--lime); color: var(--lime-dark); }
  .ss-submit { padding: 15px 24px; border-radius: 12px; border: none; background: var(--lime); color: var(--lime-dark); font-size: clamp(14.5px, 3.6vw, 16px); font-weight: 800; cursor: pointer; font-family: inherit; width: 100%; }
`

const ACCEPT: Record<string, string> = {
  bio_full: 'application/pdf,.doc,.docx',
  photo: 'image/jpeg,image/png',
  passport: 'application/pdf,image/jpeg,image/png',
  national_id: 'application/pdf,image/jpeg,image/png',
}

const HELP_TEXT: Record<string, string> = {
  photo: 'High-resolution JPG or PNG photo. Upper-body shot without cropping the head, neck, or torso. Max file size: 5MB.',
  bio_full: 'Upload a Word document or PDF, less than 5MB in size.',
  passport: 'Upload a clear, legible scanned copy of your passport (photo page) — make sure all information is clearly visible. Accepted formats: JPG, PNG, or PDF.',
  national_id: 'Upload a clear, legible scanned copy of your UAE National ID (front and back) — make sure all information is clearly visible. Accepted formats: JPG, PNG, or PDF.',
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
  const [shortBio, setShortBio] = useState('')
  const [country, setCountry] = useState('')
  const [uaeAnswer, setUaeAnswer] = useState<'yes' | 'no' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/public/speaker-submission/${speakerId}/review-data?token=${token}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not load this request.'); return r.json() })
      .then((d: ReviewData) => {
        setData(d)
        setShortBio(d.current_short_bio || '')
        setCountry(d.current_country || '')
      })
      .catch(e => setLoadError(e.message))
  }, [speakerId, token])

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

  const requestedKeys = new Set(data.requested_fields.map(f => f.key))
  const profileItems = PROFILE_KEYS.filter(k => requestedKeys.has(k))
  const licenseItems = LICENSE_KEYS.filter(k => requestedKeys.has(k))
  const needsUaeQuestion = data.is_uae_resident === null && licenseItems.includes('national_id')
  // Whether to actually show the license document upload fields yet: not
  // gated at all if we already know the answer (or the question doesn't
  // apply), otherwise held back until the speaker answers it here.
  const showLicenseUploads = !needsUaeQuestion || uaeAnswer !== null
  const showNationalId = licenseItems.includes('national_id') && (data.is_uae_resident === true || uaeAnswer === 'yes')

  async function submit() {
    // Only what this form actually SHOWS the speaker counts — the fields the producer picked when
    // composing the request. State for anything not shown (a pre-filled bio/country, a file chosen
    // before switching the UAE answer) is never validated or sent.
    const shownFileKeys = [
      ...profileItems.filter(k => k === 'photo' || k === 'bio_full'),
      ...(showLicenseUploads && licenseItems.includes('passport') ? ['passport'] : []),
      ...(showLicenseUploads && showNationalId ? ['national_id'] : []),
    ]
    const shownFiles = shownFileKeys.filter(k => files[k])
    const hasShortBio = profileItems.includes('short_bio') && shortBio.trim().length > 0
    const hasCountry = profileItems.includes('country') && country.trim().length > 0
    if (shownFiles.length === 0 && !hasShortBio && !hasCountry) { setSubmitError('Please add at least one item before submitting.'); return }
    if (hasShortBio && shortBio.trim().length > MAX_SHORT_BIO_CHARS) { setSubmitError(`Short Bio must be ${MAX_SHORT_BIO_CHARS} characters or less.`); return }
    setSubmitting(true); setSubmitError(null)
    const form = new FormData()
    for (const key of shownFiles) form.append(key, files[key] as File)
    if (hasShortBio) form.append('short_bio', shortBio.trim())
    if (hasCountry) form.append('country', country.trim())
    if (needsUaeQuestion && uaeAnswer) form.append('is_uae_resident', uaeAnswer)
    const res = await fetch(`/api/public/speaker-submission/${speakerId}/submit?token=${token}`, { method: 'POST', body: form })
    const result = await res.json().catch(() => ({}))
    if (res.ok) setDone(true)
    else setSubmitError(result.error || 'Could not submit — please try again.')
    setSubmitting(false)
  }

  return (
    <div className="ss-shell">
      <style>{PAGE_STYLES}</style>
      <div className="ss-wrap">
        <h1 className="ss-title">A Quick Follow-Up</h1>
        <div className="ss-event">{data.event_name}</div>

        <div style={{ fontSize: 'clamp(13.5px, 3.4vw, 15px)', color: 'var(--ink2)', lineHeight: 1.6, marginTop: '18px' }}>
          Dear {data.speaker_name ?? 'Speaker'}, to finish setting up your speaker profile we still need the following from you.
        </div>

        {profileItems.length > 0 && (
          <div className="ss-card">
            <div>
              <div className="ss-section-title">Your Speaker Profile</div>
              <div className="ss-section-sub">Used for your public speaker listing and event materials.</div>
            </div>

            {profileItems.includes('photo') && (
              <div className="ss-field">
                <div className="ss-item-label">Photo</div>
                <input type="file" accept={ACCEPT.photo} className="ss-file-input" onChange={e => setFiles(prev => ({ ...prev, photo: e.target.files?.[0] ?? null }))} />
                <div className="ss-help">{HELP_TEXT.photo}</div>
              </div>
            )}

            {profileItems.includes('bio_full') && (
              <div className="ss-field">
                <div className="ss-item-label">Full Bio</div>
                <input type="file" accept={ACCEPT.bio_full} className="ss-file-input" onChange={e => setFiles(prev => ({ ...prev, bio_full: e.target.files?.[0] ?? null }))} />
                <div className="ss-help">{HELP_TEXT.bio_full}</div>
              </div>
            )}

            {profileItems.includes('short_bio') && (
              <div className="ss-field">
                <div className="ss-item-label">Short Bio</div>
                <textarea
                  className="ss-textarea"
                  value={shortBio}
                  onChange={e => setShortBio(e.target.value)}
                  placeholder="A short professional bio for the event website and speaker listing…"
                />
                <div className={`ss-charcount${shortBio.length > MAX_SHORT_BIO_CHARS ? ' over' : ''}`}>{shortBio.length} / {MAX_SHORT_BIO_CHARS} characters</div>
              </div>
            )}

            {profileItems.includes('country') && (
              <div className="ss-field">
                <div className="ss-item-label">Country of Residence</div>
                <select className="ss-select" value={country} onChange={e => setCountry(e.target.value)}>
                  <option value="">Select a country…</option>
                  {HUBSPOT_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {licenseItems.length > 0 && (
          <div className="ss-card">
            <div>
              <div className="ss-section-title">Speaker License Requirements</div>
              <div className="ss-section-sub">Required for your speaker badge — kept separate from your public profile and never shown publicly.</div>
            </div>

            {needsUaeQuestion && (
              <div className="ss-field">
                <div className="ss-item-label">Are you a UAE resident?</div>
                <div className="ss-help">This determines which document(s) we need from you.</div>
                <div className="ss-radio-row">
                  <button type="button" className={`ss-radio-btn${uaeAnswer === 'yes' ? ' active' : ''}`} onClick={() => setUaeAnswer('yes')}>Yes</button>
                  <button type="button" className={`ss-radio-btn${uaeAnswer === 'no' ? ' active' : ''}`} onClick={() => setUaeAnswer('no')}>No</button>
                </div>
              </div>
            )}

            {showLicenseUploads && licenseItems.includes('passport') && (
              <div className="ss-field">
                <div className="ss-item-label">Passport</div>
                <input type="file" accept={ACCEPT.passport} className="ss-file-input" onChange={e => setFiles(prev => ({ ...prev, passport: e.target.files?.[0] ?? null }))} />
                <div className="ss-help">{HELP_TEXT.passport}</div>
              </div>
            )}

            {showLicenseUploads && showNationalId && (
              <div className="ss-field">
                <div className="ss-item-label">National ID</div>
                <input type="file" accept={ACCEPT.national_id} className="ss-file-input" onChange={e => setFiles(prev => ({ ...prev, national_id: e.target.files?.[0] ?? null }))} />
                <div className="ss-help">{HELP_TEXT.national_id}</div>
              </div>
            )}
          </div>
        )}

        <div className="ss-card">
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
