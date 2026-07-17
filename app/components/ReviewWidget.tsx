'use client'

import { useState, useEffect, useRef } from 'react'

const TOOLS = [
  { key: 'events',          label: 'Events Hub'           },
  { key: 'hr_portal',       label: 'HR Portal'            },
  { key: 'smart_data',      label: 'Smart Data'           },
  { key: 'brand_studio',    label: 'Brand Studio'         },
  { key: 'website_builder', label: 'Website Builder'      },
  { key: 'content',         label: 'Content Engine'       },
  { key: 'intelligence',    label: 'Intelligence Reports' },
  { key: 'finance',         label: 'Finance'              },
  { key: 'other',           label: 'Other / General'      },
]

const TYPES = [
  { key: 'bug',         label: 'Bug',         desc: 'Something is broken or behaving incorrectly'  },
  { key: 'not_working', label: 'Not Working', desc: 'Feature completely fails or throws an error'  },
  { key: 'suggestion',  label: 'Suggestion',  desc: "A new feature or workflow you'd like to see"  },
  { key: 'improvement', label: 'Improvement', desc: 'Existing feature that could work better'      },
]

const SEVERITIES = [
  { key: 'critical', label: 'Critical', color: 'var(--red)',     desc: 'Blocks me from working'        },
  { key: 'high',     label: 'High',     color: 'var(--orange)',  desc: 'Significant impact on my work'  },
  { key: 'medium',   label: 'Medium',   color: 'var(--amber)',   desc: 'Annoying but workable'          },
  { key: 'low',      label: 'Low',      color: 'var(--success)', desc: 'Minor issue or nice-to-have'    },
]

const C = {
  bg:      'var(--surface)',
  surface: 'var(--card)',
  border:  'var(--border)',
  text:    'var(--ink)',
  muted:   'var(--ink3)',
  teal:    'var(--teal-mid)',
}

export default function ReviewWidget() {
  const [authed,      setAuthed]      = useState(false)
  const [open,        setOpen]        = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [done,        setDone]        = useState(false)
  const [error,       setError]       = useState('')

  const [tool,        setTool]        = useState('')
  const [reviewType,  setReviewType]  = useState('')
  const [severity,    setSeverity]    = useState('medium')
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')

  // Screenshot state
  const [screenshot,    setScreenshot]    = useState<File | null>(null)
  const [screenshotUrl, setScreenshotUrl] = useState<string>('')   // local preview
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function checkAuth() {
      fetch('/api/auth/session')
        .then(r => r.json())
        .then(s => setAuthed(!!s?.sid))
        .catch(() => setAuthed(false))
    }
    checkAuth()
    // Re-check on focus (catches logout in another tab)
    window.addEventListener('focus', checkAuth)
    return () => window.removeEventListener('focus', checkAuth)
  }, [])

  // NavBar's shared Help menu ("Report an Issue") opens this same modal via
  // a custom event rather than duplicating the form — this widget is the
  // one place it's implemented.
  useEffect(() => {
    function openFromHelpMenu() { setOpen(true); setDone(false); setError('') }
    window.addEventListener('ep:open-report-issue', openFromHelpMenu)
    return () => window.removeEventListener('ep:open-report-issue', openFromHelpMenu)
  }, [])

  // Hide on public pages
  const isPublicPage = typeof window !== 'undefined' && (
    window.location.pathname === '/login' ||
    window.location.pathname === '/join' ||
    window.location.pathname === '/set-password' ||
    window.location.pathname === '/reset-password' ||
    window.location.pathname === '/welcome' ||
    window.location.pathname === '/access-pending'
  )

  // Bug 5: never unmount the widget while a modal is open. The window.focus auth
  // re-check can transiently return { sid: null } when the Microsoft SSO cookie
  // parse hiccups (same class of bug as finance blank pages / RealtimeNotifications).
  // Unmounting mid-submission was destroying the "Review submitted" success screen
  // that staff reported as disappearing after they submitted feedback.
  if (isPublicPage) return null
  if (!authed && !open) return null

  function openModal()  { setOpen(true); setDone(false); setError('') }
  function closeModal() {
    setOpen(false)
    setTool(''); setReviewType(''); setSeverity('medium'); setTitle(''); setDescription('')
    setScreenshot(null); setScreenshotUrl('')
    setDone(false); setError('')
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { setError('Only image files allowed.'); return }
    if (f.size > 5 * 1024 * 1024)    { setError('Screenshot must be under 5 MB.'); return }
    setError('')
    setScreenshot(f)
    setScreenshotUrl(URL.createObjectURL(f))
  }

  function removeScreenshot() {
    setScreenshot(null)
    setScreenshotUrl('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!tool || !reviewType || !title.trim() || !description.trim()) {
      setError('Please fill in all required fields.')
      return
    }
    setSubmitting(true)
    try {
      // Upload screenshot if attached
      let uploadedUrl: string | undefined
      if (screenshot) {
        const fd = new FormData()
        fd.append('file', screenshot)
        const upRes = await fetch('/api/reviews/upload', { method: 'POST', body: fd })
        const upData = await upRes.json()
        if (!upRes.ok) throw new Error(upData.error ?? 'Screenshot upload failed.')
        uploadedUrl = upData.url
      }

      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool, review_type: reviewType, severity,
          title: title.trim(), description: description.trim(),
          ...(uploadedUrl ? { screenshot_url: uploadedUrl } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Submission failed.')
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: C.bg, border: `1px solid ${C.border}`,
    borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: C.text,
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: 700, color: C.muted,
    letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '8px',
  }

  return (
    <>
      {/* Modal */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,25,35,0.45)', backdropFilter: 'blur(3px)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: '20px', width: '100%', maxWidth: '520px',
            maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 16px 48px rgba(0,0,0,0.14)',
          }}>

            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: C.text }}>Report an Issue</div>
                <div style={{ fontSize: '13px', color: C.muted, marginTop: '2px' }}>Your feedback helps us improve Event Pilot</div>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: '4px', display: 'flex', alignItems: 'center' }}>
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px 24px' }}>
              {done ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'color-mix(in srgb, ' + C.teal + ' 8%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <svg width="26" height="26" fill="none" stroke={C.teal} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: C.text, marginBottom: '8px' }}>Review submitted</div>
                  <div style={{ fontSize: '14px', color: C.muted, lineHeight: 1.6, marginBottom: '24px' }}>
                    Thank you. We'll review this and make updates as needed.
                  </div>
                  <button onClick={closeModal} style={{ background: C.teal, color: 'var(--teal-light)', border: 'none', borderRadius: '10px', padding: '10px 24px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>

                  {/* Tool */}
                  <div style={{ marginBottom: '18px' }}>
                    <label style={labelStyle}>Which tool? <span style={{ color: 'var(--red)' }}>*</span></label>
                    <select required value={tool} onChange={e => setTool(e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">Select tool…</option>
                      {TOOLS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </div>

                  {/* Type */}
                  <div style={{ marginBottom: '18px' }}>
                    <label style={labelStyle}>Type of review <span style={{ color: 'var(--red)' }}>*</span></label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {TYPES.map(t => (
                        <button
                          key={t.key} type="button"
                          onClick={() => setReviewType(t.key)}
                          style={{
                            padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                            background: reviewType === t.key ? 'color-mix(in srgb, ' + C.teal + ' 7%, transparent)' : C.bg,
                            border: `1px solid ${reviewType === t.key ? C.teal : C.border}`,
                            transition: 'all 0.15s', fontFamily: 'inherit',
                          }}
                        >
                          <div style={{ fontSize: '13px', fontWeight: 700, color: reviewType === t.key ? C.teal : C.text }}>{t.label}</div>
                          <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px', lineHeight: 1.4 }}>{t.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Severity */}
                  <div style={{ marginBottom: '18px' }}>
                    <label style={labelStyle}>Severity</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {SEVERITIES.map(sv => (
                        <button
                          key={sv.key} type="button"
                          onClick={() => setSeverity(sv.key)}
                          style={{
                            padding: '6px 14px', borderRadius: '100px', cursor: 'pointer', fontFamily: 'inherit',
                            fontSize: '12px', fontWeight: 700,
                            background: severity === sv.key ? `color-mix(in srgb, ${sv.color} 15%, transparent)` : C.bg,
                            border: `1px solid ${severity === sv.key ? sv.color : C.border}`,
                            color: severity === sv.key ? sv.color : C.muted,
                            transition: 'all 0.15s',
                          }}
                        >
                          {sv.label}
                        </button>
                      ))}
                    </div>
                    {severity && (
                      <div style={{ fontSize: '12px', color: C.muted, marginTop: '6px' }}>
                        {SEVERITIES.find(s => s.key === severity)?.desc}
                      </div>
                    )}
                  </div>

                  {/* Title */}
                  <div style={{ marginBottom: '18px' }}>
                    <label style={labelStyle}>Title <span style={{ color: 'var(--red)' }}>*</span></label>
                    <input
                      required type="text" value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="e.g. Budget export button not working in Events Hub"
                      style={inputStyle}
                    />
                  </div>

                  {/* Description */}
                  <div style={{ marginBottom: '18px' }}>
                    <label style={labelStyle}>Describe the issue <span style={{ color: 'var(--red)' }}>*</span></label>
                    <textarea
                      required rows={4} value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="What were you doing? What did you expect? What actually happened?"
                      style={{ ...inputStyle, resize: 'vertical', minHeight: '90px', lineHeight: '1.5' }}
                    />
                  </div>

                  {/* Screenshot */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={labelStyle}>Screenshot <span style={{ fontSize: '10px', fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: C.muted }}>(optional, max 5 MB)</span></label>
                    {screenshotUrl ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img
                          src={screenshotUrl} alt="screenshot preview"
                          style={{ maxWidth: '100%', maxHeight: '180px', borderRadius: '10px', border: `1px solid ${C.border}`, display: 'block', objectFit: 'contain' }}
                        />
                        <button
                          type="button" onClick={removeScreenshot}
                          title="Remove screenshot"
                          style={{
                            position: 'absolute', top: '6px', right: '6px',
                            width: '24px', height: '24px', borderRadius: '50%',
                            background: 'rgba(15,25,35,0.7)', border: 'none',
                            color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                        <div style={{ fontSize: '12px', color: C.muted, marginTop: '6px' }}>{screenshot?.name}</div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          width: '100%', padding: '16px', borderRadius: '10px', cursor: 'pointer',
                          background: C.bg, border: `1.5px dashed ${C.border}`,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                          fontFamily: 'inherit', transition: 'border-color 0.15s',
                        }}
                        onMouseOver={e => e.currentTarget.style.borderColor = C.teal}
                        onMouseOut={e  => e.currentTarget.style.borderColor = C.border}
                      >
                        <svg width="20" height="20" fill="none" stroke={C.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <span style={{ fontSize: '13px', color: C.muted, fontWeight: 600 }}>Click to attach a screenshot</span>
                        <span style={{ fontSize: '11px', color: C.border }}>PNG, JPG, WebP</span>
                      </button>
                    )}
                    <input
                      ref={fileInputRef} type="file" accept="image/*"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                  </div>

                  {error && (
                    <div style={{ background: 'var(--red-light)', border: '1px solid var(--red-border)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: 'var(--red)', marginBottom: '16px' }}>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit" disabled={submitting}
                    style={{
                      width: '100%', padding: '12px', borderRadius: '12px',
                      background: submitting ? C.bg : C.teal,
                      color: submitting ? C.muted : 'var(--teal-light)',
                      border: `1px solid ${submitting ? C.border : C.teal}`,
                      fontSize: '15px', fontWeight: 700,
                      cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}
                  >
                    {submitting ? 'Submitting…' : 'Submit Review'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
