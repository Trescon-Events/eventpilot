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

const TIER_COLOR: Record<string, string> = {
  foundation: '#FF9F43',
  adoption:   '#00A5A3',
  advanced:   '#C0F43C',
}

/* ─── Simple Markdown → JSX ──────────────────────────────────── */
function MarkdownBlock({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('# ')) {
      elements.push(<h2 key={i} style={{ fontSize: '36px', fontWeight: 800, color: '#1E2124', margin: '28px 0 10px', letterSpacing: '-0.2px' }}>{line.slice(2)}</h2>)
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i} style={{ fontSize: '20px', fontWeight: 800, color: '#1E2124', margin: '22px 0 8px' }}>{line.slice(3)}</h3>)
    } else if (line.startsWith('### ')) {
      elements.push(<h4 key={i} style={{ fontSize: '18px', fontWeight: 800, color: '#00A5A3', margin: '18px 0 6px', textTransform: 'uppercase', letterSpacing: '1px' }}>{line.slice(4)}</h4>)
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} style={{ margin: '10px 0', borderLeft: '3px solid #00A5A3', paddingLeft: '16px', color: '#464D53', fontStyle: 'italic', fontSize: '20px', lineHeight: 1.65 }}>
          {renderInline(line.slice(2))}
        </blockquote>
      )
    } else if (line.startsWith('- ')) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '6px', alignItems: 'flex-start' }}>
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00A5A3', marginTop: '8px', flexShrink: 0 }} />
          <span style={{ fontSize: '20px', color: '#464D53', lineHeight: 1.65 }}>{renderInline(line.slice(2))}</span>
        </div>
      )
    } else if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: '8px' }} />)
    } else {
      elements.push(<p key={i} style={{ fontSize: '20px', color: '#464D53', lineHeight: 1.65, margin: '0 0 4px' }}>{renderInline(line)}</p>)
    }
    i++
  }
  return <div>{elements}</div>
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ fontWeight: 800, color: '#1E2124' }}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

/* ════════════════════════════════════════════════════════════════ */
function CourseContent() {
  const params   = useParams()
  const search   = useSearchParams()
  const courseId = params.id as string
  const staffId  = search.get('staff_id') ?? ''

  const [course,          setCourse]          = useState<Course | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [step,            setStep]            = useState(0)
  const [taskDone,        setTaskDone]        = useState<Set<number>>(new Set())
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
  const [currentQ,        setCurrentQ]        = useState(0)
  const [timeLeft,        setTimeLeft]        = useState(45)
  const [qTimes,          setQTimes]          = useState<number[]>([])   // seconds taken per question
  const [qAnswered,       setQAnswered]       = useState(false)           // current Q answered flag
  const timeStartRef  = useRef<number>(Date.now())
  const qStartRef     = useRef<number>(Date.now())
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    loadCourse()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId])

  // Per-question countdown timer
  useEffect(() => {
    if (step !== 3 || generatingQ || servedQuestions.length === 0) return
    if (currentQ >= servedQuestions.length) return

    setTimeLeft(45)
    setQAnswered(false)
    qStartRef.current = Date.now()

    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          advanceQuestion()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQ, step, generatingQ, servedQuestions.length])

  function advanceQuestion() {
    const timeTaken = Math.round((Date.now() - qStartRef.current) / 1000)
    setQTimes(prev => [...prev, timeTaken])
    setCurrentQ(prev => prev + 1)
  }

  function handleSelectAnswer(optionIndex: number) {
    if (qAnswered) return
    setAnswers(prev => ({ ...prev, [currentQ]: optionIndex }))
    setQAnswered(true)
    if (timerRef.current) clearInterval(timerRef.current)
    // Brief pause so staff can see their selection, then advance
    setTimeout(() => advanceQuestion(), 900)
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

  // Step 1: validate submission, show popup
  function enterTest() {
    if (!course) return
    if (!submission.trim()) {
      setSubmissionError(true)
      document.getElementById('output-field')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
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
        question_times:     qTimes,
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
          <div style={{ width: '36px', height: '36px', border: '3px solid rgba(0,165,163,0.15)', borderTopColor: '#00A5A3', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
          <div style={{ color: '#464D53', fontSize: '20px' }}>Loading course…</div>
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', color: '#FF6B6B' }}>Course not found.</div>
          <Link href={staffId ? `/dashboard?id=${staffId}` : '/dashboard'} style={{ display: 'inline-block', marginTop: '16px', color: '#00A5A3', fontWeight: 700, fontSize: '20px' }}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const tierColor = TIER_COLOR[course.tier_level] ?? '#00A5A3'

  return (
    <div style={S.page}>

      {/* ── Pre-test popup ── */}
      {showPopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '20px', padding: '36px 32px', maxWidth: '440px', width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${tierColor}18`, border: `1px solid ${tierColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
              <svg width="20" height="20" fill="none" stroke={tierColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div style={{ fontSize: '36px', fontWeight: 800, color: '#1E2124', marginBottom: '14px', lineHeight: 1.3 }}>Before you begin</div>
            <div style={{ fontSize: '20px', color: '#464D53', lineHeight: 1.72, marginBottom: '10px' }}>
              This test is built entirely around <strong style={{ color: '#1E2124' }}>your specific submission</strong>. Every question is unique to what you did — not a generic quiz anyone else will see.
            </div>
            <div style={{ fontSize: '20px', color: '#464D53', lineHeight: 1.72, marginBottom: '10px' }}>
              Trescademy uses AI to review the authenticity of your responses — not to penalise you, but to ensure your TAIRS score genuinely reflects your ability and helps us support you better.
            </div>
            <div style={{ fontSize: '20px', color: '#464D53', lineHeight: 1.72, marginBottom: '24px' }}>
              AI is your <strong style={{ color: '#1E2124' }}>learning tool</strong> here, not your shortcut. The people who grow fastest are the ones who engage honestly.
            </div>
            <div style={{ background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '12px', padding: '14px 16px', marginBottom: '24px', fontSize: '20px', color: '#464D53', lineHeight: 1.6 }}>
              Each question has a <strong style={{ color: '#1E2124' }}>45-second timer</strong>. Questions are shown one at a time and cannot be revisited. Answer from what you know.
            </div>
            <button
              onClick={startTest}
              style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: tierColor, color: course.tier_level === 'adoption' ? 'white' : '#1E2124', fontSize: '18px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
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
          <Link href={staffId ? `/dashboard?id=${staffId}` : '/dashboard'} style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: '#464D53', fontSize: '18px', fontWeight: 600 }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            Dashboard
          </Link>
          <span style={{ color: 'rgba(70,77,83,0.35)' }}>/</span>
          <span style={{ fontSize: '18px', color: '#464D53', fontWeight: 700, maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{course.title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '18px', fontWeight: 700, color: tierColor, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: tierColor }} />
          {course.tier_level}
        </div>
      </nav>

      {/* ── Step progress bar ── */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #C8DFE0' }}>
        <div style={{ maxWidth: '780px', margin: '0 auto', padding: '0 24px', display: 'flex', gap: '0' }}>
          {STEPS.map((s, i) => {
            const active = step === i
            const done   = step > i || (i === 4 && result !== null)
            return (
              <div key={s} style={{ flex: 1, padding: '14px 8px', textAlign: 'center', borderBottom: `2px solid ${active ? tierColor : done ? 'rgba(70,77,83,0.3)' : 'transparent'}`, cursor: done && i < step ? 'pointer' : 'default' }}
                onClick={() => { if (done && i < step) setStep(i) }}
              >
                <div style={{ fontSize: '18px', fontWeight: 700, color: active ? tierColor : done ? '#464D53' : 'rgba(70,77,83,0.45)', letterSpacing: '1px', textTransform: 'uppercase' }}>
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
              <span style={{ fontSize: '18px', fontWeight: 800, color: tierColor, textTransform: 'uppercase', letterSpacing: '1.5px', background: `${tierColor}15`, padding: '4px 12px', borderRadius: '20px' }}>
                {course.tier_level} track
              </span>
              <span style={{ fontSize: '20px', color: '#1E2124', fontWeight: 600 }}>{course.estimated_minutes} min</span>
              {course.is_mandatory && <span style={{ fontSize: '18px', fontWeight: 700, color: '#FF9F43', background: '#FF9F4315', padding: '4px 10px', borderRadius: '20px' }}>Mandatory</span>}
            </div>

            <h1 style={{ fontSize: '36px', fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.5px', lineHeight: 1.2, color: '#1E2124' }}>{course.title}</h1>
            <p style={{ fontSize: '18px', color: '#464D53', marginBottom: '32px' }}>{course.subtitle}</p>

            {prevResult?.passed && (
              <div style={{ background: 'rgba(192,244,60,0.08)', border: '1px solid rgba(192,244,60,0.25)', borderRadius: '14px', padding: '16px 20px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <svg width="18" height="18" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#3D6B00' }}>Already completed — score: {prevResult.test_score}%</div>
                  <div style={{ fontSize: '20px', color: '#464D53' }}>You can retake this course to review the material.</div>
                </div>
              </div>
            )}

            <div style={{ background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '16px', padding: '24px 28px', marginBottom: '32px', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '2px', color: tierColor, textTransform: 'uppercase', marginBottom: '14px' }}>Why this matters</div>
              {course.overview.split('\n\n').map((para, i) => (
                <p key={i} style={{ fontSize: '20px', color: '#464D53', lineHeight: 1.75, margin: '0 0 12px' }}>{para}</p>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '32px' }}>
              {[
                { icon: 'M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z', label: 'Read', desc: 'Core concepts' },
                { icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11', label: 'Do This', desc: `${course.task_steps.length} steps on your system` },
                { icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Test', desc: `5 personalised questions` },
              ].map(({ icon, label, desc }) => (
                <div key={label} style={{ background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '12px', padding: '16px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
                  <svg width="20" height="20" fill="none" stroke={tierColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ marginBottom: '8px' }}><path d={icon}/></svg>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#1E2124' }}>{label}</div>
                  <div style={{ fontSize: '18px', color: '#1E2124' }}>{desc}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '24px', padding: '12px 16px', background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '10px', fontSize: '20px', color: '#464D53', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Your test draws 5 personalised questions based on your submission. Every attempt is different.
            </div>

            <button onClick={() => setStep(1)} style={{ padding: '14px 26px', background: tierColor, border: 'none', borderRadius: '14px', fontSize: '18px', fontWeight: 800, color: course.tier_level === 'adoption' ? 'white' : '#1E2124', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Start Reading
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        )}

        {/* ════ STEP 1: READ ════ */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '2px', color: tierColor, textTransform: 'uppercase', marginBottom: '24px' }}>Reading Material</div>
            <div style={{ background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '16px', padding: '32px', marginBottom: '32px', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
              <MarkdownBlock content={course.read_content} />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setStep(0)} style={S.backBtn}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
                Back
              </button>
              <button onClick={() => setStep(2)} style={{ ...S.primaryBtn, background: tierColor, color: course.tier_level === 'adoption' ? 'white' : '#1E2124' }}>
                Start the Task
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* ════ STEP 2: DO THIS ════ */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '2px', color: tierColor, textTransform: 'uppercase', marginBottom: '8px' }}>Hands-On Task</div>
            <h2 style={{ fontSize: '36px', fontWeight: 800, color: '#1E2124', marginBottom: '6px' }}>Do This Now</h2>
            <p style={{ fontSize: '20px', color: '#464D53', marginBottom: '28px', lineHeight: 1.65 }}>
              Complete each step on your own system. Check them off as you go — then paste your output below.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '28px' }}>
              {course.task_steps.map((ts) => {
                const done = taskDone.has(ts.step)
                return (
                  <div
                    key={ts.step}
                    style={{ background: done ? 'rgba(192,244,60,0.06)' : '#FFFFFF', border: `1px solid ${done ? 'rgba(192,244,60,0.25)' : '#C8DFE0'}`, borderRadius: '14px', padding: '20px 22px', cursor: 'pointer', transition: 'all 0.15s ease', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}
                    onClick={() => setTaskDone(prev => {
                      const next = new Set(prev)
                      if (next.has(ts.step)) next.delete(ts.step); else next.add(ts.step)
                      return next
                    })}
                  >
                    <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: `2px solid ${done ? '#C0F43C' : '#C8DFE0'}`, background: done ? '#C0F43C20' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                        {done
                          ? <svg width="13" height="13" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                          : <span style={{ fontSize: '18px', fontWeight: 800, color: '#1E2124' }}>{ts.step}</span>
                        }
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: done ? 'rgba(70,77,83,0.45)' : '#1E2124', lineHeight: 1.65, textDecoration: done ? 'line-through' : 'none' }}>
                          {injectProfile(ts.instruction)}
                        </div>
                        {ts.tip && (
                          <div style={{ marginTop: '8px', background: `${tierColor}10`, border: `1px solid ${tierColor}25`, borderRadius: '8px', padding: '8px 12px', fontSize: '20px', color: `${tierColor}`, lineHeight: 1.55, fontStyle: 'italic' }}>
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
                <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: submissionError ? '#FF6B6B' : '#464D53' }}>
                  Your Output
                </div>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#FF9F43', background: 'rgba(255,159,67,0.12)', border: '1px solid rgba(255,159,67,0.3)', padding: '2px 7px', borderRadius: '5px' }}>Required</span>
              </div>
              <div style={{ background: 'rgba(255,159,67,0.06)', border: '1px solid rgba(255,159,67,0.2)', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <svg width="14" height="14" fill="none" stroke="#FF9F43" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '1px' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div style={{ fontSize: '18px', color: '#464D53', lineHeight: 1.65 }}>
                  Paste what you produced — your AI prompt, the output, or a brief description of what you did. <strong style={{ color: '#1E2124' }}>This is your evidence of completing the task and is required before you can take the test.</strong>
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
                  border: `1.5px solid ${submissionError ? '#FF6B6B' : submission.trim() ? `${tierColor}50` : '#C8DFE0'}`,
                  background: submissionError ? 'rgba(255,107,107,0.05)' : '#FFFFFF', color: '#1E2124',
                  fontSize: '18px', fontFamily: 'inherit', lineHeight: 1.65,
                  outline: 'none', resize: 'vertical',
                }}
              />
              {submissionError && (
                <div style={{ marginTop: '8px', fontSize: '18px', color: '#FF6B6B', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  You must submit your output before taking the test. Paste what you produced above.
                </div>
              )}
              {submission.trim() && !submissionError && (
                <div style={{ marginTop: '6px', fontSize: '18px', color: tierColor, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  Output recorded — you are ready to take the test.
                </div>
              )}
            </div>

            <div style={{ marginBottom: '24px', fontSize: '18px', color: '#464D53' }}>
              {taskDone.size} of {course.task_steps.length} steps checked off
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setStep(1)} style={S.backBtn}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
                Back
              </button>
              <button onClick={enterTest} style={{ ...S.primaryBtn, background: tierColor, color: course.tier_level === 'adoption' ? 'white' : '#1E2124' }}>
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
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#1E2124', marginBottom: '8px' }}>Personalising your test</div>
                <div style={{ fontSize: '18px', color: '#464D53' }}>Building questions from your submission…</div>
              </div>
            )}

            {/* One question at a time */}
            {!generatingQ && servedQuestions.length > 0 && currentQ < servedQuestions.length && (
              <div>
                {/* Progress + timer header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '2px', color: tierColor, textTransform: 'uppercase', marginBottom: '4px' }}>Knowledge Test</div>
                    <div style={{ fontSize: '18px', color: '#464D53' }}>Question {currentQ + 1} of {servedQuestions.length}</div>
                  </div>
                  {/* Countdown circle */}
                  <div style={{ position: 'relative', width: '52px', height: '52px' }}>
                    <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="26" cy="26" r="22" fill="none" stroke="#D8EAEB" strokeWidth="3" />
                      <circle cx="26" cy="26" r="22" fill="none" stroke={timeLeft <= 10 ? '#FF6B6B' : tierColor} strokeWidth="3"
                        strokeDasharray={`${2 * Math.PI * 22}`}
                        strokeDashoffset={`${2 * Math.PI * 22 * (1 - timeLeft / 45)}`}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
                      />
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 800, color: timeLeft <= 10 ? '#FF6B6B' : '#1E2124' }}>
                      {timeLeft}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ height: '3px', background: '#D8EAEB', borderRadius: '2px', marginBottom: '28px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: tierColor, borderRadius: '2px', width: `${(currentQ / servedQuestions.length) * 100}%`, transition: 'width 0.3s ease' }} />
                </div>

                {/* Question */}
                <div style={{ background: '#FFFFFF', border: `1px solid #C8DFE0`, borderRadius: '16px', padding: '24px', marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#1E2124', lineHeight: 1.55 }}>
                    {servedQuestions[currentQ].question}
                  </div>
                </div>

                {/* Options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {servedQuestions[currentQ].options.map((opt, oi) => {
                    const sel = answers[currentQ] === oi
                    return (
                      <button
                        key={oi}
                        onClick={() => handleSelectAnswer(oi)}
                        disabled={qAnswered}
                        style={{
                          padding: '14px 18px', borderRadius: '12px', textAlign: 'left',
                          border: `1.5px solid ${sel ? tierColor : '#C8DFE0'}`,
                          background: sel ? `${tierColor}18` : '#FFFFFF',
                          color: sel ? '#1E2124' : '#464D53',
                          fontSize: '20px', fontWeight: sel ? 700 : 400,
                          cursor: qAnswered ? 'default' : 'pointer',
                          fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', gap: '12px',
                          transition: 'all 0.15s ease',
                          opacity: qAnswered && !sel ? 0.45 : 1,
                        }}
                      >
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: `1.5px solid ${sel ? tierColor : '#C8DFE0'}`, background: sel ? `${tierColor}30` : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {sel && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: tierColor }} />}
                        </div>
                        {opt}
                      </button>
                    )
                  })}
                </div>

                {qAnswered && (
                  <div style={{ marginTop: '16px', fontSize: '20px', color: '#1E2124', textAlign: 'center' }}>
                    Moving to next question…
                  </div>
                )}
              </div>
            )}

            {/* All questions answered — ready to submit */}
            {!generatingQ && servedQuestions.length > 0 && currentQ >= servedQuestions.length && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: `${tierColor}15`, border: `2px solid ${tierColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <svg width="28" height="28" fill="none" stroke={tierColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div style={{ fontSize: '36px', fontWeight: 800, color: '#1E2124', marginBottom: '8px' }}>All questions answered</div>
                <div style={{ fontSize: '18px', color: '#464D53', marginBottom: '28px' }}>Submit when you are ready to see your result.</div>
                <button
                  onClick={submitAnswers}
                  disabled={submitting}
                  style={{ ...S.primaryBtn, background: tierColor, color: course.tier_level === 'adoption' ? 'white' : '#1E2124', opacity: submitting ? 0.6 : 1 }}
                >
                  {submitting ? 'Submitting…' : 'Submit My Answers'}
                  {!submitting && <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ════ STEP 4: RESULT ════ */}
        {step === 4 && result && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: `3px solid ${result.passed ? '#C0F43C' : '#FF6B6B'}`, background: result.passed ? '#C0F43C12' : '#FF6B6B12', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                {result.passed
                  ? <svg width="34" height="34" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  : <svg width="34" height="34" fill="none" stroke="#FF6B6B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                }
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '2px', color: result.passed ? '#C0F43C' : '#FF6B6B', textTransform: 'uppercase', marginBottom: '10px' }}>
                {result.passed ? 'Course Passed' : 'Not Passed Yet'}
              </div>
              <div style={{ fontSize: '52px', fontWeight: 900, color: '#1E2124', lineHeight: 1 }}>{result.score}%</div>
              <div style={{ fontSize: '20px', color: '#464D53', marginTop: '8px' }}>
                {result.correct} of {result.total} correct · {result.passed ? 'You passed! 70% was needed.' : 'You need 70% to pass.'}
              </div>
            </div>

            {/* Flagged notice — private, shown only to staff */}
            {result.flagged && (
              <div style={{ background: 'rgba(255,159,67,0.06)', border: '1px solid rgba(255,159,67,0.25)', borderRadius: '16px', padding: '20px 22px', marginBottom: '28px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <svg width="18" height="18" fill="none" stroke="#FF9F43" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '2px' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#FF9F43', marginBottom: '6px' }}>
                      {(result.offense_number ?? 1) >= 3 ? 'This has been noted.' : 'A private note for you'}
                    </div>
                    <div style={{ fontSize: '18px', color: '#464D53', lineHeight: 1.65 }}>
                      {(result.offense_number ?? 1) === 1 && 'We noticed your test responses may not fully reflect the work in your submission. No action has been taken — this is just between you and us. A retake done honestly will improve your TAIRS score and replace this result.'}
                      {(result.offense_number ?? 1) === 2 && 'This is the second time we have noticed this pattern. Your TAIRS confidence rating has been adjusted. Completing this course honestly will restore it — and your manager has not been informed.'}
                      {(result.offense_number ?? 1) >= 3 && 'This pattern has been noted across multiple attempts. Your learning progress has been flagged for a support conversation. Trescademy is here to help — please reach out to your manager or HR if you need support with the material.'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Breakdown */}
            <div style={{ marginBottom: '32px' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '2px', color: '#1E2124', textTransform: 'uppercase', marginBottom: '16px' }}>Question Breakdown</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {result.breakdown.map((item, i) => (
                  <div key={i} style={{ background: item.is_correct ? 'rgba(192,244,60,0.05)' : 'rgba(255,107,107,0.05)', border: `1px solid ${item.is_correct ? 'rgba(192,244,60,0.2)' : 'rgba(255,107,107,0.2)'}`, borderRadius: '14px', padding: '18px 20px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: item.is_correct ? '#C0F43C20' : '#FF6B6B20', border: `1.5px solid ${item.is_correct ? '#C0F43C' : '#FF6B6B'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {item.is_correct
                          ? <svg width="10" height="10" fill="none" stroke="#C0F43C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                          : <svg width="10" height="10" fill="none" stroke="#FF6B6B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        }
                      </div>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#1E2124', marginBottom: '4px' }}>Q{i + 1}: {item.question}</div>
                        {!item.is_correct && item.selected !== null && item.options && (
                          <div style={{ fontSize: '20px', color: '#FF6B6B', marginBottom: '4px' }}>
                            Your answer: {item.options[item.selected]}
                          </div>
                        )}
                        {item.options && (
                          <div style={{ fontSize: '20px', color: item.is_correct ? '#C0F43C' : '#464D53' }}>
                            {item.is_correct ? 'Correct: ' : 'Correct answer: '}{item.options[item.correct_index]}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: '20px', color: '#464D53', lineHeight: 1.65, paddingLeft: '34px', fontStyle: 'italic' }}>
                      {item.explanation}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {result.passed ? (
                <Link href={staffId ? `/dashboard?id=${staffId}` : '/dashboard'} style={{ ...S.primaryBtnLink, background: '#C0F43C', color: '#1E2124' }}>
                  Back to Dashboard
                  <svg width="14" height="14" fill="none" stroke="#1E2124" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </Link>
              ) : (
                <>
                  <button onClick={() => { setAnswers({}); setCurrentQ(0); setQTimes([]); setResult(null); setStep(2) }} style={{ ...S.primaryBtn, background: tierColor, color: course.tier_level === 'adoption' ? 'white' : '#1E2124' }}>
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
    background: '#F6FFFE',
    minHeight:  '100vh',
    color:      '#1E2124',
  },
  nav: {
    background:   '#FFFFFF',
    borderBottom: '1px solid #C8DFE0',
    padding:      '0 32px',
    height:       '52px',
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'space-between',
    boxShadow:    '0 1px 3px rgba(0,165,163,0.08)',
  },
  backBtn: {
    padding: '12px 20px', borderRadius: '12px', border: '1px solid #C8DFE0',
    background: '#FFFFFF', color: '#464D53', fontSize: '18px',
    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: '6px',
  } as React.CSSProperties,
  primaryBtn: {
    padding: '14px 26px', borderRadius: '12px', border: 'none',
    fontSize: '20px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: '8px',
  } as React.CSSProperties,
  primaryBtnLink: {
    padding: '14px 26px', borderRadius: '12px', textDecoration: 'none',
    fontSize: '20px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '8px',
  } as React.CSSProperties,
  backBtnLink: {
    padding: '14px 20px', borderRadius: '12px', border: '1px solid #C8DFE0',
    color: '#464D53', fontSize: '18px', fontWeight: 700,
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
