'use client'

import { useState, useEffect } from 'react'

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
  { key: 'bug',         label: 'Bug',              desc: 'Something is broken or behaving incorrectly'   },
  { key: 'not_working', label: 'Not Working',      desc: 'Feature completely fails or throws an error'   },
  { key: 'suggestion',  label: 'Suggestion',       desc: "A new feature or workflow you'd like to see"   },
  { key: 'improvement', label: 'Improvement',      desc: 'Existing feature that could work better'       },
]

const SEVERITIES = [
  { key: 'critical', label: 'Critical', color: '#EF4444', desc: 'Blocks me from working'       },
  { key: 'high',     label: 'High',     color: '#F97316', desc: 'Significant impact on my work' },
  { key: 'medium',   label: 'Medium',   color: '#F59E0B', desc: 'Annoying but workable'         },
  { key: 'low',      label: 'Low',      color: '#22C55E', desc: 'Minor issue or nice-to-have'   },
]

const s = {
  overlay: {
    position: 'fixed' as const, inset: 0,
    background: 'rgba(8,10,11,0.72)', backdropFilter: 'blur(4px)',
    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
  },
  modal: {
    background: '#0E1520', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '20px', width: '100%', maxWidth: '520px',
    maxHeight: '90vh', overflowY: 'auto' as const,
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  },
  header: {
    padding: '20px 24px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  body: { padding: '20px 24px 24px' },
  label: { display: 'block', fontSize: '12px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.8px', textTransform: 'uppercase' as const, marginBottom: '8px' },
  input: {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
    padding: '10px 14px', fontSize: '14px', color: '#E2E8F0',
    outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit',
  },
  select: {
    width: '100%', background: '#0E1520',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
    padding: '10px 14px', fontSize: '14px', color: '#E2E8F0',
    outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit', cursor: 'pointer',
  },
  row: { marginBottom: '18px' },
}

export default function ReviewWidget() {
  const [authed,   setAuthed]   = useState(false)
  const [open,     setOpen]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done,     setDone]     = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(s => { if (s?.sid) setAuthed(true) })
      .catch(() => {})
  }, [])

  const [tool,        setTool]        = useState('')
  const [reviewType,  setReviewType]  = useState('')
  const [severity,    setSeverity]    = useState('medium')
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')

  if (!authed) return null

  function openModal()  { setOpen(true); setDone(false); setError('') }
  function closeModal() {
    setOpen(false)
    setTool(''); setReviewType(''); setSeverity('medium'); setTitle(''); setDescription('')
    setDone(false); setError('')
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
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, review_type: reviewType, severity, title: title.trim(), description: description.trim() }),
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

  return (
    <>
      {/* ── Floating trigger button ── */}
      <button
        onClick={openModal}
        title="Report an issue or suggestion"
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 9000,
          display: 'flex', alignItems: 'center', gap: '8px',
          background: '#00A5A3', color: '#fff',
          border: 'none', borderRadius: '100px',
          padding: '10px 18px',
          fontSize: '13px', fontWeight: 700, fontFamily: 'inherit',
          cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,165,163,0.35)',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,165,163,0.45)' }}
        onMouseOut={e  => { e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,165,163,0.35)' }}
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <line x1="8" y1="10" x2="16" y2="10"/>
          <line x1="8" y1="14" x2="13" y2="14"/>
        </svg>
        Report Issue
      </button>

      {/* ── Modal ── */}
      {open && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={s.modal}>

            {/* Header */}
            <div style={s.header}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#F1F5F9' }}>Report an Issue</div>
                <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>Your feedback helps us improve Event Pilot</div>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '4px' }}>
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Body */}
            <div style={s.body}>
              {done ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(0,165,163,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <svg width="26" height="26" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: '#F1F5F9', marginBottom: '8px' }}>Review submitted</div>
                  <div style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6, marginBottom: '24px' }}>
                    Thank you. We'll review this and make updates as needed. You can close this window.
                  </div>
                  <button onClick={closeModal} style={{ background: '#00A5A3', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 24px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>

                  {/* Tool */}
                  <div style={s.row}>
                    <label style={s.label}>Which tool?  <span style={{ color: '#EF4444' }}>*</span></label>
                    <select required value={tool} onChange={e => setTool(e.target.value)} style={s.select}>
                      <option value="">Select tool…</option>
                      {TOOLS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </div>

                  {/* Type */}
                  <div style={s.row}>
                    <label style={s.label}>Type of review  <span style={{ color: '#EF4444' }}>*</span></label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {TYPES.map(t => (
                        <button
                          key={t.key} type="button"
                          onClick={() => setReviewType(t.key)}
                          style={{
                            padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                            background: reviewType === t.key ? 'rgba(0,165,163,0.15)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${reviewType === t.key ? '#00A5A3' : 'rgba(255,255,255,0.08)'}`,
                            transition: 'all 0.15s', fontFamily: 'inherit',
                          }}
                        >
                          <div style={{ fontSize: '13px', fontWeight: 700, color: reviewType === t.key ? '#00A5A3' : '#CBD5E1' }}>{t.label}</div>
                          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', lineHeight: 1.4 }}>{t.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Severity */}
                  <div style={s.row}>
                    <label style={s.label}>Severity</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {SEVERITIES.map(sv => (
                        <button
                          key={sv.key} type="button"
                          onClick={() => setSeverity(sv.key)}
                          style={{
                            padding: '6px 14px', borderRadius: '100px', cursor: 'pointer', fontFamily: 'inherit',
                            fontSize: '12px', fontWeight: 700,
                            background: severity === sv.key ? sv.color + '22' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${severity === sv.key ? sv.color : 'rgba(255,255,255,0.1)'}`,
                            color: severity === sv.key ? sv.color : '#64748B',
                            transition: 'all 0.15s',
                          }}
                        >
                          {sv.label}
                        </button>
                      ))}
                    </div>
                    {severity && (
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                        {SEVERITIES.find(s => s.key === severity)?.desc}
                      </div>
                    )}
                  </div>

                  {/* Title */}
                  <div style={s.row}>
                    <label style={s.label}>Title  <span style={{ color: '#EF4444' }}>*</span></label>
                    <input
                      required type="text" value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="e.g. Budget export button not working in Events Hub"
                      style={s.input}
                    />
                  </div>

                  {/* Description */}
                  <div style={s.row}>
                    <label style={s.label}>Describe the issue  <span style={{ color: '#EF4444' }}>*</span></label>
                    <textarea
                      required rows={4} value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="What were you doing? What did you expect? What actually happened? Steps to reproduce if possible."
                      style={{ ...s.input, resize: 'vertical' as const, minHeight: '90px', lineHeight: '1.5' }}
                    />
                  </div>

                  {error && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#FCA5A5', marginBottom: '16px' }}>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit" disabled={submitting}
                    style={{
                      width: '100%', padding: '12px', borderRadius: '12px',
                      background: submitting ? '#1A2A35' : '#00A5A3',
                      color: submitting ? '#64748B' : '#fff',
                      border: 'none', fontSize: '15px', fontWeight: 700,
                      cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      transition: 'background 0.15s',
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
