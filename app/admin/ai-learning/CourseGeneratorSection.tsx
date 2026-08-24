'use client'

import { useEffect, useState } from 'react'

export default function CourseGeneratorSection() {
  const [suggestion, setSuggestion]   = useState('')
  const [suggestDept, setSuggestDept] = useState('Events')
  const [suggestTier, setSuggestTier] = useState<'foundation' | 'adoption' | 'advanced'>('foundation')
  const [suggestState, setSuggestState] = useState<'idle' | 'thinking' | 'ready' | 'publishing'>('idle')
  const [generatedCourse, setGeneratedCourse] = useState<Record<string, unknown> | null>(null)
  const [publishMsg, setPublishMsg]   = useState('')
  // Attribution — who suggested this course
  const [creditName, setCreditName]   = useState('')
  const [creditRole, setCreditRole]   = useState('')
  const [creditId,   setCreditId]     = useState('')
  // Dept course seeding
  const [deptSeedDept,   setDeptSeedDept]   = useState('Events')
  const [deptSeedTier,   setDeptSeedTier]   = useState<'foundation' | 'adoption' | 'advanced'>('foundation')
  const [deptSeedCount,  setDeptSeedCount]  = useState(2)
  const [deptSeedState,  setDeptSeedState]  = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [deptSeedResult, setDeptSeedResult] = useState<{ courses: { id: string; title: string; tier_level: string }[]; errors?: string[] } | null>(null)
  // Cosmetic elapsed-seconds readout while a job's running — same "keeps
  // climbing so it reads as still working, not hung" pattern used for the
  // Photo Cleaning Wizard's own long AI waits (PhotoCleaningWizard.tsx).
  const [deptSeedElapsedSec, setDeptSeedElapsedSec] = useState(0)

  useEffect(() => {
    if (deptSeedState !== 'generating') return
    setDeptSeedElapsedSec(0)
    const tick = setInterval(() => setDeptSeedElapsedSec(s => s + 1), 1000)
    return () => clearInterval(tick)
  }, [deptSeedState])

  async function submitSuggestion() {
    if (!suggestion.trim()) return
    setSuggestState('thinking')
    setGeneratedCourse(null)
    setPublishMsg('')
    const res = await fetch('/api/generate-course', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_code: process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026',
        suggestion: suggestion.trim(),
        department: suggestDept,
        tier_level: suggestTier,
      }),
    })
    const data = await res.json()
    if (res.ok && data.course) {
      setGeneratedCourse(data.course)
      setSuggestState('ready')
    } else {
      setPublishMsg(data.error ?? 'Failed to generate. Try again.')
      setSuggestState('idle')
    }
  }

  async function submitForReview() {
    if (!generatedCourse) return
    setSuggestState('publishing')
    const courseWithCredit = {
      ...generatedCourse,
      ...(creditName ? { suggested_by_name: creditName, suggested_by_role: creditRole || null } : {}),
      ...(creditId   ? { suggested_by_id:   creditId   } : {}),
    }
    const pubRes = await fetch('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_code: process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026', course: courseWithCredit }),
    })
    if (pubRes.ok) {
      setPublishMsg(`Course submitted for review. You will be notified on your dashboard once it is approved and live.`)
      setSuggestState('idle')
      setSuggestion('')
      setGeneratedCourse(null)
      setCreditName('')
      setCreditRole('')
      setCreditId('')
    } else {
      const d = await pubRes.json()
      setPublishMsg(d.error ?? 'Submission failed. Try again.')
      setSuggestState('ready')
    }
  }

  // Dept Course Seeding now runs as a background job (2026-08-24 — see
  // /api/generate-dept-courses' own doc comment: up to 3 sequential full
  // Gemini course generations can run long enough to risk the Cloudflare
  // proxy timeout in front of production, which doesn't exist in local
  // dev). Polls .../generate-dept-courses/job/[jobId] every few seconds
  // until the job leaves 'processing'.
  const DEPT_SEED_POLL_INTERVAL_MS = 3000
  const DEPT_SEED_POLL_MAX_ATTEMPTS = 100 // ~5 min ceiling, generous past the worst case for 3 courses
  async function pollDeptSeedJob(jobId: string, attempt: number) {
    try {
      const res = await fetch(`/api/generate-dept-courses/job/${jobId}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.status === 'error') {
        setDeptSeedResult({ courses: [], errors: [data.error ?? 'Generation failed'] })
        setDeptSeedState('error')
        return
      }
      if (data.status === 'processing') {
        if (attempt >= DEPT_SEED_POLL_MAX_ATTEMPTS) {
          setDeptSeedResult({ courses: [], errors: ['This is taking much longer than usual — please check the Review Queue shortly, or try again.'] })
          setDeptSeedState('error')
          return
        }
        setTimeout(() => pollDeptSeedJob(jobId, attempt + 1), DEPT_SEED_POLL_INTERVAL_MS)
        return
      }
      setDeptSeedResult({ courses: data.courses ?? [], errors: data.errors })
      setDeptSeedState('done')
    } catch {
      // A transient network blip on one poll tick shouldn't fail the whole
      // run — retry like any other tick, same attempt cap as above.
      if (attempt >= DEPT_SEED_POLL_MAX_ATTEMPTS) {
        setDeptSeedResult({ courses: [], errors: ['Could not reach the server — check your connection and try again.'] })
        setDeptSeedState('error')
        return
      }
      setTimeout(() => pollDeptSeedJob(jobId, attempt + 1), DEPT_SEED_POLL_INTERVAL_MS)
    }
  }

  return (
    <div style={{ maxWidth: '720px' }}>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#A478FF', marginBottom: '6px' }}>Learning Lab</div>
        <h2 style={{ fontSize: '36px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 6px' }}>Build a Course</h2>
        <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: 0, lineHeight: 1.6 }}>Describe the gap you have spotted. Gemini will design a full course — overview, tasks, and 10 quiz questions — ready to review and publish. The person who suggested it gets credited on the course card and receives a notification on their dashboard when it goes live.</p>
      </div>

      {/* Input panel */}
      {(suggestState === 'idle' || suggestState === 'thinking') && (
        <div style={{ background: 'rgba(164,120,255,0.06)', border: '1px solid rgba(164,120,255,0.2)', borderRadius: '16px', padding: '28px' }}>
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Your Suggestion</label>
            <textarea
              value={suggestion}
              onChange={e => setSuggestion(e.target.value)}
              placeholder="e.g. Create a course for the Events team on using AI to build run-of-show documents and vendor briefing packs"
              rows={4}
              disabled={suggestState === 'thinking'}
              style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(164,120,255,0.25)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', lineHeight: 1.6, outline: 'none', resize: 'vertical', opacity: suggestState === 'thinking' ? 0.6 : 1 }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '22px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Department</label>
              <select value={suggestDept} onChange={e => setSuggestDept(e.target.value)} disabled={suggestState === 'thinking'}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                {['Events', 'Sales & Sponsorship', 'Marketing', 'Finance', 'Operations', 'IT', 'HR & Recruitment', 'Content & Design', 'Government Relations', 'DemandifyMedia', 'Leadership'].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Tier Level</label>
              <select value={suggestTier} onChange={e => setSuggestTier(e.target.value as 'foundation' | 'adoption' | 'advanced')} disabled={suggestState === 'thinking'}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                <option value="foundation">Foundation — AI basics for this role</option>
                <option value="adoption">Adoption — Intermediate workflows</option>
                <option value="advanced">Advanced — Strategy and leadership</option>
              </select>
            </div>
          </div>
          {/* Credit to field */}
          <div style={{ marginBottom: '22px', background: 'rgba(164,120,255,0.05)', border: '1px solid rgba(164,120,255,0.15)', borderRadius: '12px', padding: '16px 18px' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#A478FF', marginBottom: '12px' }}>Course Credit</div>
            <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '0 0 12px', lineHeight: 1.55 }}>
              Who identified this gap and requested this course? They will be credited on the course card and notified on their dashboard when it goes live.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '6px' }}>Full Name</label>
                <input
                  value={creditName}
                  onChange={e => setCreditName(e.target.value)}
                  placeholder="e.g. Priya Menon"
                  disabled={suggestState === 'thinking'}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '6px' }}>Role / Department</label>
                <input
                  value={creditRole}
                  onChange={e => setCreditRole(e.target.value)}
                  placeholder="e.g. Head of Events"
                  disabled={suggestState === 'thinking'}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
                />
              </div>
            </div>
          </div>

          <button onClick={submitSuggestion} disabled={!suggestion.trim() || suggestState === 'thinking'}
            style={{ padding: '13px 28px', borderRadius: '12px', border: 'none', background: suggestion.trim() && suggestState !== 'thinking' ? 'var(--purple)' : 'var(--border)', color: suggestion.trim() && suggestState !== 'thinking' ? 'var(--purple-light)' : 'var(--ink)', fontSize: '13px', fontWeight: 800, cursor: suggestion.trim() && suggestState !== 'thinking' ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {suggestState === 'thinking' ? 'Designing your course...' : 'Generate Course'}
          </button>
        </div>
      )}

      {/* Thinking state — conversational response */}
      {suggestState === 'thinking' && (
        <div style={{ marginTop: '20px', background: 'rgba(164,120,255,0.08)', border: '1px solid rgba(164,120,255,0.25)', borderRadius: '16px', padding: '24px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(164,120,255,0.2)', border: '2px solid rgba(164,120,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" fill="none" stroke="#A478FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#A478FF', marginBottom: '4px' }}>Course Designer</div>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>
              I have received your suggestion for a <strong style={{ color: 'var(--ink)' }}>{suggestTier}</strong> course for the <strong style={{ color: 'var(--ink)' }}>{suggestDept}</strong> team. I am preparing a course just right — with full reading content, personalised tasks, and a 10-question bank. Sending it for your approval shortly...
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '5px' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#A478FF', animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Generated course review */}
      {(suggestState === 'ready' || suggestState === 'publishing') && generatedCourse && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ background: 'rgba(164,120,255,0.08)', border: '1px solid rgba(164,120,255,0.25)', borderRadius: '16px', padding: '20px 24px', marginBottom: '20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(164,120,255,0.2)', border: '2px solid rgba(164,120,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" fill="none" stroke="#A478FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#A478FF', marginBottom: '4px' }}>Course Designer</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>
                Your course is ready for review. I have built a complete <strong style={{ color: 'var(--ink)' }}>{suggestTier}</strong> course for <strong style={{ color: 'var(--ink)' }}>{suggestDept}</strong> with full reading content, 4 personalised task steps, and a 10-question bank. Review it below — edit anything you like — then approve to publish.
              </div>
            </div>
          </div>

          {/* Course preview */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', marginBottom: '20px' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#A478FF', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>{(generatedCourse.tier_level as string)} · {suggestDept}</div>
              <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--ink)', marginBottom: '4px' }}>{generatedCourse.title as string}</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{generatedCourse.subtitle as string}</div>
            </div>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>Overview</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.7 }}>{generatedCourse.overview as string}</div>
            </div>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' }}>Task Steps ({(generatedCourse.task_steps as unknown[]).length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(generatedCourse.task_steps as Array<{step: number; instruction: string; tip: string}>).map((ts) => (
                  <div key={ts.step} style={{ padding: '12px 16px', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#A478FF', marginBottom: '4px' }}>Step {ts.step}</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.55 }}>{ts.instruction}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
                Question Bank ({(generatedCourse.question_bank as unknown[]).length} questions · 5 served randomly per attempt)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(generatedCourse.question_bank as Array<{question: string; correct_index: number; options: string[]}>).map((q, i) => (
                  <div key={i} style={{ padding: '12px 16px', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 600, marginBottom: '4px' }}>Q{i + 1}: {q.question}</div>
                    <div style={{ fontSize: '13px', color: 'var(--teal)' }}>Correct: {q.options[q.correct_index]}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Credit preview */}
          {creditName && (
            <div style={{ padding: '12px 16px', background: 'rgba(164,120,255,0.07)', border: '1px solid rgba(164,120,255,0.2)', borderRadius: '10px', fontSize: '13px', color: 'var(--ink3)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(164,120,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#A478FF' }}>{creditName.charAt(0)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--ink3)' }}>Suggested by </span>
                <strong style={{ color: 'var(--ink)' }}>{creditName}</strong>
                {creditRole && <span style={{ color: 'var(--ink3)' }}> · {creditRole}</span>}
                <span style={{ color: 'var(--ink)', fontSize: '13px', display: 'block', marginTop: '1px' }}>Will be credited on the course card. Email notification sent on publish.</span>
              </div>
            </div>
          )}

          {publishMsg && (
            <div style={{ padding: '12px 16px', background: publishMsg.includes('live') ? 'rgba(192,244,60,0.1)' : 'rgba(255,107,107,0.1)', border: `1px solid ${publishMsg.includes('live') ? 'rgba(192,244,60,0.3)' : 'rgba(255,107,107,0.3)'}`, borderRadius: '10px', fontSize: '13px', color: publishMsg.includes('live') ? 'var(--lime)' : 'var(--red)', fontWeight: 700, marginBottom: '16px' }}>
              {publishMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={submitForReview} disabled={suggestState === 'publishing'}
              style={{ padding: '13px 28px', borderRadius: '12px', border: 'none', background: 'var(--purple)', color: 'var(--purple-light)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', opacity: suggestState === 'publishing' ? 0.7 : 1 }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
              {suggestState === 'publishing' ? 'Submitting...' : 'Submit for Review'}
            </button>
            <button onClick={() => { setSuggestState('idle'); setGeneratedCourse(null); setPublishMsg('') }}
              style={{ padding: '13px 20px', borderRadius: '12px', border: '1px solid var(--ink4)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* ── Dept Course Seeding ── */}
      <div style={{ marginTop: '40px', paddingTop: '32px', borderTop: '1px solid var(--surface)' }}>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '6px' }}>Dept Seeding</div>
          <h3 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 6px' }}>Seed Department Courses</h3>
          <p style={{ fontSize: '15px', color: 'var(--ink3)', margin: 0, lineHeight: 1.6 }}>Generate multiple draft courses for a specific department in one go. Pilot AI builds them from Trescon context — saved as drafts for your review before publishing.</p>
        </div>

        <div style={{ background: 'rgba(0,165,163,0.05)', border: '1px solid rgba(0,165,163,0.18)', borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: '14px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Department</label>
              <select value={deptSeedDept} onChange={e => setDeptSeedDept(e.target.value)} disabled={deptSeedState === 'generating'}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                {['Events', 'Sales & Sponsorship', 'Marketing', 'Finance', 'Operations', 'HR', 'Content & Design', 'Data & Intelligence', 'Leadership'].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Tier Level</label>
              <select value={deptSeedTier} onChange={e => setDeptSeedTier(e.target.value as 'foundation' | 'adoption' | 'advanced')} disabled={deptSeedState === 'generating'}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                <option value="foundation">Foundation</option>
                <option value="adoption">Adoption</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Count</label>
              <select value={deptSeedCount} onChange={e => setDeptSeedCount(Number(e.target.value))} disabled={deptSeedState === 'generating'}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </div>
          </div>

          <button
            disabled={deptSeedState === 'generating'}
            onClick={async () => {
              setDeptSeedState('generating')
              setDeptSeedResult(null)
              try {
                const res = await fetch('/api/generate-dept-courses', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ department: deptSeedDept, tier_level: deptSeedTier, count: deptSeedCount }),
                })
                const data = await res.json()
                if (!res.ok || !data.job_id) throw new Error(data.error ?? 'Generation failed')
                pollDeptSeedJob(data.job_id, 0)
              } catch (err) {
                setDeptSeedResult({ courses: [], errors: [String(err)] })
                setDeptSeedState('error')
              }
            }}
            style={{ padding: '13px 28px', borderRadius: '12px', border: 'none', background: deptSeedState === 'generating' ? 'var(--border)' : 'var(--teal-mid)', color: deptSeedState === 'generating' ? 'var(--ink3)' : 'var(--teal-light)', fontSize: '13px', fontWeight: 800, cursor: deptSeedState === 'generating' ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {deptSeedState === 'generating' ? `Generating ${deptSeedCount} course${deptSeedCount > 1 ? 's' : ''}… (${deptSeedElapsedSec}s)` : `Generate ${deptSeedCount} Draft Course${deptSeedCount > 1 ? 's' : ''}`}
          </button>
        </div>

        {(deptSeedState === 'done' || deptSeedState === 'error') && deptSeedResult && (
          <div style={{ marginTop: '16px' }}>
            {deptSeedResult.courses.length > 0 && (
              <div style={{ background: 'rgba(192,244,60,0.08)', border: '1px solid rgba(192,244,60,0.3)', borderRadius: '12px', padding: '16px 18px', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--lime)', marginBottom: '10px' }}>{deptSeedResult.courses.length} draft course{deptSeedResult.courses.length > 1 ? 's' : ''} saved — ready for review in the Review Queue</div>
                {deptSeedResult.courses.map(c => (
                  <div key={c.id} style={{ fontSize: '13px', color: 'var(--ink3)', padding: '6px 0', borderTop: '1px solid rgba(192,244,60,0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--teal-mid)', flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ color: 'var(--ink)', fontWeight: 700 }}>{c.title}</span>
                    <span style={{ color: 'var(--ink4)' }}>·</span>
                    <span style={{ textTransform: 'capitalize' }}>{c.tier_level}</span>
                  </div>
                ))}
              </div>
            )}
            {deptSeedResult.errors && deptSeedResult.errors.length > 0 && (
              <div style={{ background: 'var(--red-light)', border: '1px solid var(--red-border)', borderRadius: '12px', padding: '14px 16px', fontSize: '13px', color: 'var(--red)' }}>
                {deptSeedResult.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            <button onClick={() => { setDeptSeedState('idle'); setDeptSeedResult(null) }}
              style={{ marginTop: '10px', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Generate More
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
