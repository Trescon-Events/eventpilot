'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useParams } from 'next/navigation'
import Link from 'next/link'

/* ─── Types ──────────────────────────────────────────────────── */
interface TaskStep {
  step:        number
  instruction: string
  tip:         string
}

interface Question {
  question:      string
  options:       string[]
  correct_index: number
  explanation:   string
}

interface Course {
  id:                string
  title:             string
  subtitle:          string
  tool_name:         string | null
  tier_level:        string
  overview:          string
  read_content:      string
  task_steps:        TaskStep[]
  question_bank:     Question[]   // full pool — 5 served randomly per attempt
  estimated_minutes: number
  is_mandatory:      boolean
}

interface BreakdownItem {
  question:      string
  options:       string[]
  selected:      number | null
  correct_index: number
  is_correct:    boolean
  explanation:   string
}

/* ─── Step definitions ───────────────────────────────────────── */
const STEPS = ['Overview', 'Read', 'Do This', 'Test', 'Result']

// Kept as literal hex (not var()) — concatenated with alpha suffixes
// throughout this file (e.g. `${tierColor}18`), which var() can't do.
// Values match the equivalent CSS var()'s dark-theme value in globals.css.
const TIER_COLOR: Record<string, string> = {
  foundation: '#F1667A', // matches var(--red)
  adoption:   '#0EA79D', // matches var(--teal)
  advanced:   '#C0F43C', // matches var(--lime)
}

// Text-on-solid-tierColor-button counterpart (rule 3: solid saturated
// button backgrounds use that family's -light/-dark token as text, never
// white/ink) — mirrors TIER_COLOR key-for-key.
const TIER_TEXT_ON_SOLID: Record<string, string> = {
  foundation: 'var(--red-light)',
  adoption:   'var(--teal-light)',
  advanced:   'var(--lime-dark)',
}

/* ─── Simple Markdown → JSX ──────────────────────────────────── */
function MarkdownBlock({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('# ')) {
      elements.push(<h2 key={i} style={{ fontSize: '36px', fontWeight: 800, color: 'var(--ink)', margin: '28px 0 10px', letterSpacing: '-0.2px' }}>{line.slice(2)}</h2>)
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i} style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', margin: '22px 0 8px' }}>{line.slice(3)}</h3>)
    } else if (line.startsWith('### ')) {
      elements.push(<h4 key={i} style={{ fontSize: '13px', fontWeight: 800, color: 'var(--teal)', margin: '18px 0 6px', textTransform: 'uppercase', letterSpacing: '1px' }}>{line.slice(4)}</h4>)
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} style={{ margin: '10px 0', borderLeft: '3px solid var(--teal-mid)', paddingLeft: '16px', color: 'var(--ink2)', fontStyle: 'italic', fontSize: '13px', lineHeight: 1.65 }}>
          {renderInline(line.slice(2))}
        </blockquote>
      )
    } else if (line.startsWith('- ')) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '6px', alignItems: 'flex-start' }}>
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--teal-mid)', marginTop: '8px', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.65 }}>{renderInline(line.slice(2))}</span>
        </div>
      )
    } else if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: '8px' }} />)
    } else {
      elements.push(<p key={i} style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.65, margin: '0 0 4px' }}>{renderInline(line)}</p>)
    }
    i++
  }
  return <div>{elements}</div>
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ fontWeight: 800, color: 'var(--ink)' }}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

/* ════════════════════════════════════════════════════════════════ */
// Per-question countdown budget (was 45s — raised after staff feedback 30 Jun 2026)
const QUESTION_TIMER_SECONDS = 65

function CourseContent() {
  const params   = useParams()
  const search   = useSearchParams()
  const courseId = params.id as string
  const staffId  = search.get('staff_id') ?? ''

  const [course,          setCourse]          = useState<Course | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [step,            setStep]            = useState(0)
  const [taskDone,        setTaskDone]        = useState<Set<number>>(new Set())
  const [taskGateError,   setTaskGateError]   = useState(false)          // Bug 3: task-validation banner
  const [answers,         setAnswers]         = useState<Record<number, number>>({})
  const [submitting,      setSubmitting]      = useState(false)
  const [result,          setResult]          = useState<{ score: number; passed: boolean; correct: number; total: number; breakdown: BreakdownItem[]; flagged?: boolean; offense_number?: number } | null>(null)
  const [prevResult,      setPrevResult]      = useState<{ passed: boolean; test_score: number | null; attempt_count: number } | null>(null)
  const [servedQuestions, setServedQuestions] = useState<Question[]>([])
  const [submission,      setSubmission]      = useState('')
  const [submissionError, setSubmissionError] = useState(false)
  const [staffDept,       setStaffDept]       = useState('')
  const [staffRole,       setStaffRole]       = useState('')
  // Pre-test popup + dynamic question generation
  const [showPopup,       setShowPopup]       = useState(false)
  const [generatingQ,     setGeneratingQ]     = useState(false)
  // One-at-a-time question flow
  const [currentQ,           setCurrentQ]           = useState(0)
  const [timeLeft,           setTimeLeft]           = useState(QUESTION_TIMER_SECONDS)
  const [qTimes,             setQTimes]             = useState<Record<number, number>>({})  // seconds taken per Q index (Bug 2/4: allow overwrite on edit)
  const [showingReview,      setShowingReview]      = useState(false)                        // Bug 4: review-before-submit screen
  const [editingFromReview,  setEditingFromReview]  = useState(false)                        // Bug 4: mark that Next should return to review
  const timeStartRef  = useRef<number>(Date.now())
  const qStartRef     = useRef<number>(Date.now())
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    loadCourse()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId])

  // Per-question countdown timer — pauses on the review screen
  useEffect(() => {
    if (step !== 3 || generatingQ || servedQuestions.length === 0) return
    if (showingReview) return   // Bug 4: no countdown while reviewing
    if (currentQ >= servedQuestions.length) return

    setTimeLeft(QUESTION_TIMER_SECONDS)
    qStartRef.current = Date.now()

    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          handleTimerExpiry()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQ, step, generatingQ, servedQuestions.length, showingReview])

  // Bug 2: Select is now non-committal — user can re-select any time until they click Next.
  function handleSelectAnswer(optionIndex: number) {
    setAnswers(prev => ({ ...prev, [currentQ]: optionIndex }))
  }

  // Bug 2: explicit "Next" click commits the current question's time and advances.
  // Bug 4: if editing from review, return to review. If on the last question, show review.
  function handleNext() {
    const timeTaken = Math.round((Date.now() - qStartRef.current) / 1000)
    setQTimes(prev => ({ ...prev, [currentQ]: timeTaken }))
    if (timerRef.current) clearInterval(timerRef.current)
    if (editingFromReview) {
      setEditingFromReview(false)
      setShowingReview(true)
    } else if (currentQ + 1 >= servedQuestions.length) {
      setShowingReview(true)
    } else {
      setCurrentQ(prev => prev + 1)
    }
  }

  // If the countdown runs out, treat as an implicit Next (do not lose the current selection).
  function handleTimerExpiry() {
    const timeTaken = Math.round((Date.now() - qStartRef.current) / 1000)
    setQTimes(prev => ({ ...prev, [currentQ]: timeTaken }))
    if (editingFromReview) {
      setEditingFromReview(false)
      setShowingReview(true)
    } else if (currentQ + 1 >= servedQuestions.length) {
      setShowingReview(true)
    } else {
      setCurrentQ(prev => prev + 1)
    }
  }

  // Bug 4: jump back from the review screen to a specific question.
  function editQuestion(qIndex: number) {
    setShowingReview(false)
    setEditingFromReview(true)
    setCurrentQ(qIndex)
  }

  async function loadCourse() {
    timeStartRef.current = Date.now()
    const [courseRes, compRes, profRes] = await Promise.all([
      fetch(`/api/course-detail?id=${courseId}`),
      staffId ? fetch(`/api/course-completion?staff_id=${staffId}&course_id=${courseId}`) : Promise.resolve(null),
      staffId ? fetch(`/api/staff-member?id=${staffId}`) : Promise.resolve(null),
    ])
    if (courseRes.ok) setCourse(await courseRes.json())
    if (compRes?.ok) setPrevResult(await compRes.json())
    if (profRes?.ok) {
      const profData = await profRes.json()
      setStaffDept(profData.staff?.department ?? '')
      setStaffRole(profData.staff?.role ?? '')
    }
    setLoading(false)
  }

  function injectProfile(text: string): string {
    return text
      .replace(/\{\{department\}\}/g, staffDept || 'your department')
      .replace(/\{\{role\}\}/g, staffRole || 'your role')
  }

  // Step 1: validate task-completion + submission, then show popup
  function enterTest() {
    if (!course) return
    // Bug 3: hard-gate on task completion — every step must be ticked before test begins.
    if (taskDone.size < course.task_steps.length) {
      setTaskGateError(true)
      document.getElementById('task-list')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (!submission.trim()) {
      setSubmissionError(true)
      document.getElementById('output-field')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setTaskGateError(false)
    setSubmissionError(false)
    setShowPopup(true)
  }

  // Step 2: popup confirmed → generate personalised questions
  async function startTest() {
    if (!course) return
    setShowPopup(false)
    setGeneratingQ(true)
    setStep(3)
    setCurrentQ(0)
    setAnswers({})
    setQTimes([])
    timeStartRef.current = Date.now()

    try {
      const res = await fetch('/api/generate-questions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          course_title:    course.title,
          course_overview: course.overview,
          task_steps:      course.task_steps,
          submission,
        }),
      })
      const data = await res.json()
      if (data.questions?.length >= 3) {
        setServedQuestions(data.questions)
      } else {
        throw new Error('fallback')
      }
    } catch {
      // Fallback to static bank if Gemini fails
      const bank     = course.question_bank ?? []
      const shuffled = [...bank].sort(() => Math.random() - 0.5)
      setServedQuestions(shuffled.slice(0, Math.min(5, shuffled.length)))
    }
    setGeneratingQ(false)
  }

  async function submitAnswers() {
    if (!staffId || !course || servedQuestions.length === 0) return
    setSubmitting(true)
    const timeSpent = Math.round((Date.now() - timeStartRef.current) / 1000)
    // Bug 2/4: qTimes shape changed to Record — flatten to array in question order for backend compat.
    const questionTimesArr: number[] = servedQuestions.map((_, i) => qTimes[i] ?? 0)
    const res = await fetch('/api/course-completion', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        staff_id:           staffId,
        course_id:          courseId,
        answers,
        questions_served:   servedQuestions,
        task_submission:    submission || null,
        time_spent_seconds: timeSpent,
        question_times:     questionTimesArr,
      }),
    })
    const data = await res.json()
    setResult(data)
    setStep(4)
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '36px', height: '36px', border: '3px solid rgba(18,201,189,0.15)', borderTopColor: 'var(--teal-mid)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
          <div style={{ color: 'var(--ink2)', fontSize: '13px' }}>Loading course…</div>
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: 'var(--red)' }}>Course not found.</div>
          <Link href={staffId ? `/dashboard?id=${staffId}` : '/dashboard'} style={{ display: 'inline-block', marginTop: '16px', color: 'var(--teal)', fontWeight: 700, fontSize: '13px' }}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const tierColor = TIER_COLOR[course.tier_level] ?? '#12C9BD'
  const tierTextOnSolid = TIER_TEXT_ON_SOLID[course.tier_level] ?? 'var(--teal-light)'

  return (
    <div style={S.page}>

      {/* ── Pre-test popup ── */}
      {showPopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '36px 32px', maxWidth: '440px', width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${tierColor}18`, border: `1px solid ${tierColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
              <svg width="20" height="20" fill="none" stroke={tierColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div style={{ fontSize: '36px', fontWeight: 800, color: 'var(--ink)', marginBottom: '14px', lineHeight: 1.3 }}>Before you begin</div>
            <div style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.72, marginBottom: '10px' }}>
              This test is built entirely around <strong style={{ color: 'var(--ink)' }}>your specific submission</strong>. Every question is unique to what you did — not a generic quiz anyone else will see.
            </div>
            <div style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.72, marginBottom: '10px' }}>
              Event Pilot uses AI to review the authenticity of your responses — not to penalise you, but to ensure your AI Readiness Score genuinely reflects your ability and helps us support you better.
            </div>
            <div style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.72, marginBottom: '24px' }}>
              AI is your <strong style={{ color: 'var(--ink)' }}>learning tool</strong> here, not your shortcut. The people who grow fastest are the ones who engage honestly.
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', marginBottom: '24px', fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.6 }}>
              Each question has a <strong style={{ color: 'var(--ink)' }}>{QUESTION_TIMER_SECONDS}-second timer</strong>. You&apos;ll be able to review all your answers on one screen before submitting. Answer from what you know.
            </div>
            <button
              onClick={startTest}
              style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: tierColor, color: tierTextOnSolid, fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              I understand — start my test
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Nav ── */}
      <nav style={S.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link href={staffId ? `/dashboard?id=${staffId}` : '/dashboard'} style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: 'var(--ink2)', fontSize: '13px', fontWeight: 600 }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            Dashboard
          </Link>
          <span style={{ color: 'var(--ink2)' }}>/</span>
          <span style={{ fontSize: '13px', color: 'var(--ink2)', fontWeight: 700, maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{course.title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: tierColor, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: tierColor }} />
          {course.tier_level}
        </div>
      </nav>

      {/* ── Step progress bar ── */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: '780px', margin: '0 auto', padding: '0 24px', display: 'flex', gap: '0' }}>
          {STEPS.map((s, i) => {
            const active = step === i
            const done   = step > i || (i === 4 && result !== null)
            return (
              <div key={s} style={{ flex: 1, padding: '14px 8px', textAlign: 'center', borderBottom: `2px solid ${active ? tierColor : done ? 'rgba(70,77,83,0.3)' : 'transparent'}`, cursor: done && i < step ? 'pointer' : 'default' }}
                onClick={() => { if (done && i < step) setStep(i) }}
              >
                <div style={{ fontSize: '13px', fontWeight: 700, color: active ? tierColor : done ? 'var(--ink2)' : 'var(--ink4)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                  {s}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* ════ STEP 0: OVERVIEW ════ */}
        {step === 0 && (
          <div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: tierColor, textTransform: 'uppercase', letterSpacing: '1.5px', background: `${tierColor}15`, padding: '4px 12px', borderRadius: '16px' }}>
                {course.tier_level} track
              </span>
              <span style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 600 }}>{course.estimated_minutes} min</span>
              {course.is_mandatory && <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)', background: '#F1667A15', padding: '4px 10px', borderRadius: '16px' }}>Mandatory</span>}
            </div>

            <h1 style={{ fontSize: '36px', fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.5px', lineHeight: 1.2, color: 'var(--ink)' }}>{course.title}</h1>
            <p style={{ fontSize: '13px', color: 'var(--ink2)', marginBottom: '32px' }}>{course.subtitle}</p>

            {prevResult?.passed && (
              <div style={{ background: 'rgba(192,244,60,0.08)', border: '1px solid rgba(192,244,60,0.25)', borderRadius: '14px', padding: '18px 20px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <svg width="18" height="18" fill="none" stroke="var(--teal-mid)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--lime)' }}>Already completed — score: {prevResult.test_score}%</div>
                  <div style={{ fontSize: '13px', color: 'var(--ink2)' }}>You can retake this course to review the material.</div>
                </div>
              </div>
            )}

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderLeft: `4px solid ${tierColor}`, borderRadius: '16px', padding: '24px 28px', marginBottom: '32px', boxShadow: '0 2px 10px rgba(15,25,35,0.07)' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', color: tierColor, textTransform: 'uppercase', marginBottom: '14px' }}>Why this matters</div>
              {course.overview.split('\n\n').map((para, i) => (
                <p key={i} style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.75, margin: '0 0 12px' }}>{para}</p>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '32px' }}>
              {[
                { icon: 'M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z', label: 'Read', desc: 'Core concepts' },
                { icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11', label: 'Do This', desc: `${course.task_steps.length} steps on your system` },
                { icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Test', desc: `5 personalised questions` },
              ].map(({ icon, label, desc }) => (
                <div key={label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${tierColor}`, borderRadius: '12px', padding: '18px', textAlign: 'center', boxShadow: '0 2px 8px rgba(15,25,35,0.06)' }}>
                  <svg width="22" height="22" fill="none" stroke={tierColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ marginBottom: '10px' }}><path d={icon}/></svg>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '3px' }}>{label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', fontWeight: 600 }}>{desc}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '24px', padding: '12px 16px', background: 'var(--teal-light)', border: '1.5px solid var(--teal-border)', borderRadius: '10px', fontSize: '12px', color: 'var(--teal-mid)', fontWeight: 600, display: 'flex', gap: '8px', alignItems: 'center' }}>
              <svg width="13" height="13" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Your test draws 5 personalised questions based on your submission. Every attempt is different.
            </div>

            <button onClick={() => setStep(1)} style={{ padding: '14px 26px', background: tierColor, border: 'none', borderRadius: '14px', fontSize: '13px', fontWeight: 800, color: tierTextOnSolid, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Start Reading
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        )}

        {/* ════ STEP 1: READ ════ */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', color: tierColor, textTransform: 'uppercase', marginBottom: '24px' }}>Reading Material</div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', marginBottom: '32px', boxShadow: '0 2px 12px rgba(15,25,35,0.07)' }}>
              <MarkdownBlock content={course.read_content} />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setStep(0)} style={S.backBtn}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
                Back
              </button>
              <button onClick={() => setStep(2)} style={{ ...S.primaryBtn, background: tierColor, color: tierTextOnSolid }}>
                Start the Task
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* ════ STEP 2: DO THIS ════ */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', color: tierColor, textTransform: 'uppercase', marginBottom: '8px' }}>Hands-On Task</div>
            <h2 style={{ fontSize: '36px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>Do This Now</h2>
            <p style={{ fontSize: '13px', color: 'var(--ink2)', marginBottom: '28px', lineHeight: 1.65 }}>
              Complete each step on your own system. Check them off as you go — then paste your output below.
            </p>

            {/* Bug 3: task-gate error banner */}
            {taskGateError && (
              <div style={{ background: 'rgba(241,102,122,0.08)', border: '1px solid rgba(241,102,122,0.35)', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <svg width="16" height="16" fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '1px' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div style={{ fontSize: '13px', color: 'var(--red)', lineHeight: 1.6, fontWeight: 700 }}>
                  Tick off all {course.task_steps.length} hands-on steps before you can start the test.
                </div>
              </div>
            )}

            <div id="task-list" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '28px', scrollMarginTop: '40px' }}>
              {course.task_steps.map((ts) => {
                const done = taskDone.has(ts.step)
                return (
                  <div
                    key={ts.step}
                    style={{ background: done ? 'rgba(192,244,60,0.06)' : 'var(--card)', border: `1px solid ${done ? 'rgba(192,244,60,0.25)' : 'var(--border)'}`, borderRadius: '14px', padding: '20px 22px', cursor: 'pointer', transition: 'all 0.15s ease', boxShadow: '0 1px 4px rgba(18,201,189,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}
                    onClick={() => setTaskDone(prev => {
                      const next = new Set(prev)
                      if (next.has(ts.step)) next.delete(ts.step); else next.add(ts.step)
                      // Bug 3: clear gate error the moment they engage with the steps
                      if (taskGateError) setTaskGateError(false)
                      return next
                    })}
                  >
                    <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: `2px solid ${done ? 'var(--teal)' : 'var(--border)'}`, background: done ? '#C0F43C20' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                        {done
                          ? <svg width="13" height="13" fill="none" stroke="var(--teal-mid)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                          : <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{ts.step}</span>
                        }
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: done ? 'var(--ink4)' : 'var(--ink)', lineHeight: 1.65, textDecoration: done ? 'line-through' : 'none' }}>
                          {injectProfile(ts.instruction)}
                        </div>
                        {ts.tip && (
                          <div style={{ marginTop: '8px', background: `${tierColor}10`, border: `1px solid ${tierColor}25`, borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: `${tierColor}`, lineHeight: 1.55, fontStyle: 'italic' }}>
                            Tip: {ts.tip}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Submission field — mandatory, staff paste their actual AI output */}
            <div id="output-field" style={{ marginBottom: '28px', scrollMarginTop: '40px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: submissionError ? 'var(--red)' : 'var(--ink2)' }}>
                  Your Output
                </div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)', background: 'var(--card)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: '5px' }}>Required</span>
              </div>
              <div style={{ background: 'rgba(241,102,122,0.06)', border: '1px solid rgba(241,102,122,0.2)', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <svg width="14" height="14" fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '1px' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.65 }}>
                  Paste what you produced — your AI prompt, the output, or a brief description of what you did. <strong style={{ color: 'var(--ink)' }}>This is your evidence of completing the task and is required before you can take the test.</strong>
                </div>
              </div>
              <textarea
                value={submission}
                onChange={e => { setSubmission(e.target.value); if (e.target.value.trim()) setSubmissionError(false) }}
                placeholder="Paste your AI output or describe what you completed on your system..."
                rows={5}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '14px 16px', borderRadius: '12px',
                  border: `1.5px solid ${submissionError ? 'var(--red)' : submission.trim() ? `${tierColor}50` : 'var(--border)'}`,
                  background: submissionError ? 'rgba(241,102,122,0.05)' : 'var(--card)', color: 'var(--ink)',
                  fontSize: '13px', fontFamily: 'inherit', lineHeight: 1.65,
                  outline: 'none', resize: 'vertical',
                }}
              />
              {submissionError && (
                <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--red)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  You must submit your output before taking the test. Paste what you produced above.
                </div>
              )}
              {submission.trim() && !submissionError && (
                <div style={{ marginTop: '6px', fontSize: '13px', color: tierColor, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  Output recorded — you are ready to take the test.
                </div>
              )}
            </div>

            <div style={{ marginBottom: '24px', fontSize: '13px', color: 'var(--ink2)' }}>
              {taskDone.size} of {course.task_steps.length} steps checked off
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setStep(1)} style={S.backBtn}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
                Back
              </button>
              <button onClick={enterTest} style={{ ...S.primaryBtn, background: tierColor, color: tierTextOnSolid }}>
                Take the Test
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* ════ STEP 3: TEST ════ */}
        {step === 3 && (
          <div>
            {/* Generating questions loading state */}
            {generatingQ && (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ width: '48px', height: '48px', border: `3px solid ${tierColor}30`, borderTopColor: tierColor, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px' }}>Personalising your test</div>
                <div style={{ fontSize: '13px', color: 'var(--ink2)' }}>Building questions from your submission…</div>
              </div>
            )}

            {/* One question at a time */}
            {!generatingQ && servedQuestions.length > 0 && !showingReview && currentQ < servedQuestions.length && (
              <div>
                {/* Progress + timer header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', color: tierColor, textTransform: 'uppercase', marginBottom: '4px' }}>
                      {editingFromReview ? 'Editing Answer' : 'Knowledge Test'}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--ink2)' }}>Question {currentQ + 1} of {servedQuestions.length}</div>
                  </div>
                  {/* Countdown circle */}
                  <div style={{ position: 'relative', width: '52px', height: '52px' }}>
                    <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="26" cy="26" r="22" fill="none" stroke="var(--border)" strokeWidth="3" />
                      <circle cx="26" cy="26" r="22" fill="none" stroke={timeLeft <= 10 ? 'var(--red)' : tierColor} strokeWidth="3"
                        strokeDasharray={`${2 * Math.PI * 22}`}
                        strokeDashoffset={`${2 * Math.PI * 22 * (1 - timeLeft / QUESTION_TIMER_SECONDS)}`}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
                      />
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: timeLeft <= 10 ? 'var(--red)' : 'var(--ink)' }}>
                      {timeLeft}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ height: '3px', background: 'var(--border-light)', borderRadius: '2px', marginBottom: '28px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: tierColor, borderRadius: '2px', width: `${(currentQ / servedQuestions.length) * 100}%`, transition: 'width 0.3s ease' }} />
                </div>

                {/* Question */}
                <div style={{ background: 'var(--card)', border: `1px solid var(--border)`, borderLeft: `4px solid ${tierColor}`, borderRadius: '16px', padding: '24px', marginBottom: '16px', boxShadow: '0 2px 10px rgba(15,25,35,0.07)' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.55 }}>
                    {servedQuestions[currentQ].question}
                  </div>
                </div>

                {/* Options — Bug 2: no auto-submit; user can re-select any time before clicking Next */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {servedQuestions[currentQ].options.map((opt, oi) => {
                    const sel = answers[currentQ] === oi
                    return (
                      <button
                        key={oi}
                        onClick={() => handleSelectAnswer(oi)}
                        style={{
                          padding: '14px 18px', borderRadius: '12px', textAlign: 'left',
                          border: `1.5px solid ${sel ? tierColor : 'var(--border)'}`,
                          background: sel ? `${tierColor}18` : 'var(--card)',
                          color: sel ? tierColor : 'var(--ink2)',
                          fontSize: '13px', fontWeight: sel ? 700 : 400,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', gap: '12px',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: `1.5px solid ${sel ? tierColor : 'var(--border)'}`, background: sel ? `${tierColor}30` : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {sel && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: tierColor }} />}
                        </div>
                        {opt}
                      </button>
                    )
                  })}
                </div>

                {/* Bug 2: explicit Next button — appears only after an option is selected */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '24px', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '13px', color: answers[currentQ] !== undefined ? tierColor : 'var(--ink4)', fontWeight: 600 }}>
                    {answers[currentQ] !== undefined ? 'Answer locked in — you can change it or move on.' : 'Choose one option to continue.'}
                  </div>
                  <button
                    onClick={handleNext}
                    disabled={answers[currentQ] === undefined}
                    style={{
                      ...S.primaryBtn,
                      background: answers[currentQ] === undefined ? 'var(--border)' : tierColor,
                      color: answers[currentQ] === undefined ? 'var(--ink4)' : tierTextOnSolid,
                      cursor: answers[currentQ] === undefined ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {editingFromReview
                      ? 'Save & back to review'
                      : currentQ + 1 >= servedQuestions.length
                        ? 'Review all answers'
                        : 'Next question'}
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
              </div>
            )}

            {/* Bug 4: Review-before-submit screen — every answer visible + editable */}
            {!generatingQ && servedQuestions.length > 0 && showingReview && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', color: tierColor, textTransform: 'uppercase', marginBottom: '8px' }}>Review</div>
                <h2 style={{ fontSize: '36px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>Review your answers</h2>
                <p style={{ fontSize: '13px', color: 'var(--ink2)', marginBottom: '24px', lineHeight: 1.65 }}>
                  Check every answer before submitting. Tap <strong>Edit</strong> on any question to change your response — your other answers are kept.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
                  {servedQuestions.map((q, i) => {
                    const sel      = answers[i]
                    const answered = sel !== undefined
                    return (
                      <div key={i} style={{ background: 'var(--card)', border: `1px solid ${answered ? 'var(--border)' : 'rgba(241,102,122,0.4)'}`, borderLeft: `4px solid ${answered ? tierColor : 'var(--red)'}`, borderRadius: '14px', padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start', boxShadow: '0 1px 4px rgba(15,25,35,0.04)' }}>
                        <div style={{ minWidth: '28px', height: '28px', borderRadius: '50%', background: answered ? `${tierColor}18` : 'rgba(241,102,122,0.12)', border: `1.5px solid ${answered ? tierColor : 'var(--red)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: answered ? tierColor : 'var(--red)' }}>
                          {i + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.55, marginBottom: '6px' }}>{q.question}</div>
                          <div style={{ fontSize: '13px', color: answered ? 'var(--ink2)' : 'var(--red)', fontWeight: answered ? 600 : 700 }}>
                            {answered
                              ? <>Your answer: <span style={{ color: 'var(--ink)' }}>{q.options[sel]}</span></>
                              : 'Not answered — timer expired without a choice.'}
                          </div>
                        </div>
                        <button
                          onClick={() => editQuestion(i)}
                          style={{
                            padding: '8px 14px', borderRadius: '10px', border: `1px solid ${tierColor}`,
                            background: 'var(--card)', color: tierColor, fontSize: '13px', fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                            display: 'flex', alignItems: 'center', gap: '6px',
                          }}
                        >
                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                          Edit
                        </button>
                      </div>
                    )
                  })}
                </div>

                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px', fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.6 }}>
                  Once you submit, this test result will be locked in and your AI Readiness Score will be updated. You can still retake the course later if you don&apos;t pass.
                </div>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => editQuestion(0)}
                    style={S.backBtn}
                  >
                    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
                    Review from Q1
                  </button>
                  <button
                    onClick={submitAnswers}
                    disabled={submitting}
                    style={{ ...S.primaryBtn, background: tierColor, color: tierTextOnSolid, opacity: submitting ? 0.6 : 1 }}
                  >
                    {submitting ? 'Submitting…' : 'Submit My Answers'}
                    {!submitting && <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════ STEP 4: RESULT ════ */}
        {step === 4 && result && (
          <div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `4px solid ${result.passed ? 'var(--teal)' : 'var(--red)'}`, borderRadius: '16px', padding: '32px', textAlign: 'center', marginBottom: '40px', boxShadow: '0 2px 12px rgba(15,25,35,0.07)' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: `3px solid ${result.passed ? 'var(--teal)' : 'var(--red)'}`, background: result.passed ? '#C0F43C12' : '#F1667A12', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                {result.passed
                  ? <svg width="34" height="34" fill="none" stroke="var(--teal-mid)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  : <svg width="34" height="34" fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                }
              </div>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', color: result.passed ? 'var(--teal)' : 'var(--red)', textTransform: 'uppercase', marginBottom: '10px' }}>
                {result.passed ? 'Course Passed' : 'Not Passed Yet'}
              </div>
              <div style={{ fontSize: '56px', fontWeight: 900, color: result.passed ? 'var(--teal)' : 'var(--red)', lineHeight: 1, marginBottom: '8px' }}>{result.score}%</div>
              <div style={{ fontSize: '13px', color: 'var(--ink2)', fontWeight: 600 }}>
                {result.correct} of {result.total} correct · {result.passed ? 'You passed! 70% was needed.' : 'You need 70% to pass.'}
              </div>
            </div>

            {/* Flagged notice — private, shown only to staff */}
            {result.flagged && (
              <div style={{ background: 'rgba(241,102,122,0.06)', border: '1px solid rgba(241,102,122,0.25)', borderRadius: '16px', padding: '20px 22px', marginBottom: '28px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <svg width="18" height="18" fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '2px' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--red)', marginBottom: '6px' }}>
                      {(result.offense_number ?? 1) >= 3 ? 'This has been noted.' : 'A private note for you'}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.65 }}>
                      {(result.offense_number ?? 1) === 1 && 'We noticed your test responses may not fully reflect the work in your submission. No action has been taken — this is just between you and us. A retake done honestly will improve your AI Readiness Score and replace this result.'}
                      {(result.offense_number ?? 1) === 2 && 'This is the second time we have noticed this pattern. Your AIRS confidence rating has been adjusted. Completing this course honestly will restore it — and your manager has not been informed.'}
                      {(result.offense_number ?? 1) >= 3 && 'This pattern has been noted across multiple attempts. Your learning progress has been flagged for a support conversation. Event Pilot is here to help — please reach out to your manager or HR if you need support with the material.'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Breakdown */}
            <div style={{ marginBottom: '32px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', color: 'var(--ink)', textTransform: 'uppercase', marginBottom: '16px' }}>Question Breakdown</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {result.breakdown.map((item, i) => (
                  <div key={i} style={{ background: item.is_correct ? 'rgba(192,244,60,0.05)' : 'rgba(241,102,122,0.05)', border: `1px solid ${item.is_correct ? 'rgba(192,244,60,0.2)' : 'rgba(241,102,122,0.2)'}`, borderRadius: '14px', padding: '20px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: item.is_correct ? '#C0F43C20' : '#F1667A20', border: `1.5px solid ${item.is_correct ? 'var(--teal)' : 'var(--red)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {item.is_correct
                          ? <svg width="10" height="10" fill="none" stroke="var(--teal-mid)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                          : <svg width="10" height="10" fill="none" stroke="var(--red)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        }
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>Q{i + 1}: {item.question}</div>
                        {!item.is_correct && item.selected !== null && item.options && (
                          <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '4px' }}>
                            Your answer: {item.options[item.selected]}
                          </div>
                        )}
                        {item.options && (
                          <div style={{ fontSize: '13px', color: item.is_correct ? 'var(--teal)' : 'var(--ink2)' }}>
                            {item.is_correct ? 'Correct: ' : 'Correct answer: '}{item.options[item.correct_index]}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.65, paddingLeft: '34px', fontStyle: 'italic' }}>
                      {item.explanation}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {result.passed ? (
                <Link href={staffId ? `/dashboard?id=${staffId}` : '/dashboard'} style={{ ...S.primaryBtnLink, background: 'var(--lime)', color: 'var(--lime-dark)' }}>
                  Back to Dashboard
                  <svg width="14" height="14" fill="none" stroke="var(--lime-dark)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </Link>
              ) : (
                <>
                  <button onClick={() => { setAnswers({}); setCurrentQ(0); setQTimes({}); setShowingReview(false); setEditingFromReview(false); setResult(null); setStep(2) }} style={{ ...S.primaryBtn, background: tierColor, color: tierTextOnSolid }}>
                    Retake Test
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                  </button>
                  <button onClick={() => setStep(1)} style={S.backBtn}>
                    Review Reading
                  </button>
                </>
              )}
              <Link href={staffId ? `/dashboard/library?id=${staffId}` : '/dashboard/library'} style={{ ...S.backBtnLink }}>
                Browse Library
              </Link>
            </div>
          </div>
        )}

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const S = {
  page: {
    fontFamily: 'var(--font-manrope), Manrope, sans-serif',
    background: 'var(--surface)',
    minHeight:  '100vh',
    color:      'var(--ink)',
  },
  nav: {
    background:   'var(--card)',
    borderBottom: '1px solid var(--border)',
    padding:      '0 32px',
    height:       '52px',
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'space-between',
    boxShadow:    '0 1px 3px rgba(15,25,35,0.06)',
  },
  backBtn: {
    padding: '12px 20px', borderRadius: '12px', border: '1px solid var(--border)',
    background: 'var(--card)', color: 'var(--ink2)', fontSize: '13px',
    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: '6px',
  } as React.CSSProperties,
  primaryBtn: {
    padding: '14px 26px', borderRadius: '12px', border: 'none',
    fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: '8px',
  } as React.CSSProperties,
  primaryBtnLink: {
    padding: '14px 26px', borderRadius: '12px', textDecoration: 'none',
    fontSize: '13px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '8px',
  } as React.CSSProperties,
  backBtnLink: {
    padding: '14px 20px', borderRadius: '12px', border: '1px solid var(--border)',
    color: 'var(--ink2)', fontSize: '13px', fontWeight: 700,
    textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
  } as React.CSSProperties,
}

export default function CoursePage() {
  return (
    <Suspense>
      <CourseContent />
    </Suspense>
  )
}
