'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { submitProfile } from '@/app/actions/profile'
import Link from 'next/link'
import { buildQuestions, PROFICIENCY_LEVELS, DEPT_QUESTIONS } from '@/app/lib/questions'
import type { Question } from '@/app/lib/questions'

/* ─── Types ──────────────────────────────────────────────────── */
type ProfMap = Record<string, number>
type Answers = Record<string, string | string[] | number | ProfMap>

/* ─── Map answers → task profile entries for Supabase ───────── */
function buildTaskEntries(answers: Answers, department: string, staffId: string) {
  const str = (v: unknown) => (Array.isArray(v) ? (v as string[]).join(', ') : String(v ?? ''))

  const deptQs = DEPT_QUESTIONS[department] ?? DEPT_QUESTIONS['Other']
  const deptAnswers = deptQs
    .filter((q: Question) => answers[q.id] !== undefined && answers[q.id] !== '')
    .map((q: Question) => `${q.question}\n→ ${str(answers[q.id])}`)
    .join('\n\n')

  const tools = Array.isArray(answers['tools'])
    ? (answers['tools'] as string[])
    : answers['tools'] ? [str(answers['tools'])] : []

  const readiness = typeof answers['ai_readiness'] === 'number' ? (answers['ai_readiness'] as number) : 3

  const proficiency = (answers['tool_proficiency'] && typeof answers['tool_proficiency'] === 'object' && !Array.isArray(answers['tool_proficiency']))
    ? answers['tool_proficiency'] as ProfMap
    : {}

  const profText = Object.entries(proficiency).length > 0
    ? Object.entries(proficiency).map(([t, l]) => {
        const labels = ['Basic', 'Confident', 'Advanced', 'Builder']
        return `${t}: ${labels[(l as number) - 1] ?? l}`
      }).join(', ')
    : ''

  return [
    {
      staff_id:          staffId,
      task_name:         'Daily Workflow & Work Pattern',
      task_description:  [
        answers['daily_work'] ? `What a typical day looks like:\n${str(answers['daily_work'])}` : '',
        deptAnswers ? `Department-specific context:\n${deptAnswers}` : '',
        profText ? `Tool proficiency: ${profText}` : '',
        answers['tools_unlisted'] ? `Additional tools not in standard list: ${str(answers['tools_unlisted'])}` : '',
      ].filter(Boolean).join('\n\n'),
      tools_used:        tools,
      tool_proficiency:  proficiency,
      frequency:         'Daily',
      ai_readiness:      readiness,
    },
    {
      staff_id:          staffId,
      task_name:         'Key Pain Points & Time Drains',
      task_description:  [
        answers['time_drain'] ? `Biggest time drain:\n${str(answers['time_drain'])}` : '',
        answers['stuck'] ? `Main cause of delays: ${str(answers['stuck'])}` : '',
        answers['ownership_intent'] ? `What they want to keep owning:\n${str(answers['ownership_intent'])}` : '',
      ].filter(Boolean).join('\n\n'),
      automation_history: answers['automation_history'] ? str(answers['automation_history']) : '',
      frequency:          'Daily',
      ai_readiness:       readiness,
    },
    {
      staff_id:          staffId,
      task_name:         'AI Opportunity & Automation Wish',
      task_description:  [
        answers['ai_wish'] ? `If TAI could do one thing:\n${str(answers['ai_wish'])}` : '',
        answers['ai_proof'] ? `AI workflow they already use (advanced track):\n${str(answers['ai_proof'])}` : '',
      ].filter(Boolean).join('\n\n'),
      tools_unlisted:    answers['tools_unlisted'] ? str(answers['tools_unlisted']) : '',
      ai_proof:          answers['ai_proof'] ? str(answers['ai_proof']) : null,
      frequency:         'Daily',
      skill_needed:      'Identified via TAI Intelligence Interview',
      ai_readiness:      readiness,
    },
  ].filter(e => e.task_description || (e as { tools_used?: string[] }).tools_used?.length)
}

/* ─── Proficiency sub-component ─────────────────────────────── */
function ProficiencyInput({
  tools,
  value,
  onChange,
}: {
  tools: string[]
  value: ProfMap
  onChange: (updated: ProfMap) => void
}) {
  if (tools.length === 0) {
    return (
      <div style={{ padding: '20px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: '14px', textAlign: 'center' }}>
        Go back and select the tools you use first.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {tools.map(tool => (
        <div key={tool}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'white', marginBottom: '10px' }}>
            {tool}
            {value[tool] && (
              <span style={{ marginLeft: '10px', fontSize: '11px', fontWeight: 700, color: PROFICIENCY_LEVELS[value[tool] - 1].color, background: `${PROFICIENCY_LEVELS[value[tool] - 1].color}18`, padding: '2px 8px', borderRadius: '6px' }}>
                {PROFICIENCY_LEVELS[value[tool] - 1].label}
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {PROFICIENCY_LEVELS.map(({ level, label, desc, color }) => {
              const sel = value[tool] === level
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => onChange({ ...value, [tool]: level })}
                  style={{
                    padding: '12px 10px', borderRadius: '12px', textAlign: 'left',
                    border: `1.5px solid ${sel ? color : 'rgba(255,255,255,0.1)'}`,
                    background: sel ? `${color}18` : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 700, color: sel ? color : 'rgba(255,255,255,0.55)', marginBottom: '4px' }}>{label}</div>
                  <div style={{ fontSize: '10px', color: sel ? color : 'rgba(255,255,255,0.3)', lineHeight: 1.4 }}>{desc}</div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Scale colors ───────────────────────────────────────────── */
const SCALE_COLORS = ['#FF6B6B', '#FF9F43', '#F4ED3C', '#A8E6CF', '#C0F43C']

/* ═══════════════════════════════════════════════════════════════ */
function ProfileContent() {
  const params = useSearchParams()

  /* Email verify state */
  const [email, setEmail]             = useState('')
  const [verifyError, setVerifyError] = useState('')
  const [verifying, setVerifying]     = useState(false)
  const [staffName, setStaffName]     = useState('')
  const [staffId, setStaffId]         = useState('')
  const [department, setDept]         = useState('')

  /* Interview state */
  const [questions, setQuestions]     = useState<Question[]>([])
  const [step, setStep]               = useState(-1)   // -1 = verify screen
  const [answers, setAnswers]         = useState<Answers>({})
  const [currentInput, setCurrentInput] = useState<string | string[] | number | ProfMap>('')

  /* Submit state */
  const [pending, setPending]         = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone]               = useState(false)

  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  /* Auto-skip email verify when arriving from /join with pre-filled params */
  useEffect(() => {
    const preId   = params.get('id')
    const preName = params.get('name')
    const preDept = params.get('dept')
    if (preId && preName) {
      const dept = preDept && preDept !== '' ? preDept : 'Other'
      const qs   = buildQuestions(dept)
      setStaffName(preName)
      setStaffId(preId)
      setDept(dept)
      setQuestions(qs)
      setStep(0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Focus input when step changes */
  useEffect(() => {
    if (step >= 0) {
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [step])

  /* ── Verify email ── */
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setVerifyError('')
    setVerifying(true)
    const res  = await fetch('/api/verify-staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    })
    const data = await res.json()
    setVerifying(false)
    if (data.error) { setVerifyError(data.error); return }

    const dept = data.department ?? 'Other'
    const qs   = buildQuestions(dept)
    setStaffName(data.name)
    setStaffId(data.id)
    setDept(dept)
    setQuestions(qs)
    setStep(0)
  }

  /* ── Conditional skip helpers ── */
  function getNextVisibleStep(fromStep: number, allAnswers: Answers): number {
    let next = fromStep + 1
    while (next < questions.length) {
      const nq = questions[next]
      if (!nq.conditionalOn) break
      const refVal = typeof allAnswers[nq.conditionalOn.questionId] === 'number'
        ? (allAnswers[nq.conditionalOn.questionId] as number) : 0
      if (refVal >= nq.conditionalOn.minValue) break
      next++
    }
    return next
  }

  function getPrevVisibleStep(fromStep: number, allAnswers: Answers): number {
    let prev = fromStep - 1
    while (prev >= 0) {
      const pq = questions[prev]
      if (!pq.conditionalOn) break
      const refVal = typeof allAnswers[pq.conditionalOn.questionId] === 'number'
        ? (allAnswers[pq.conditionalOn.questionId] as number) : 0
      if (refVal >= pq.conditionalOn.minValue) break
      prev--
    }
    return prev
  }

  /* ── Navigate between questions ── */
  function saveCurrentAndAdvance() {
    const q = questions[step]
    const val = currentInput
    if (q.type !== 'scale' && q.type !== 'chips' && q.type !== 'select' && q.type !== 'proficiency') {
      if (String(val).trim() === '') return
    }
    const newAnswers = { ...answers, [q.id]: val }
    setAnswers(newAnswers)
    const nextStep = getNextVisibleStep(step, newAnswers)
    const nextQ    = questions[nextStep]
    setCurrentInput(nextQ ? (answers[nextQ.id] ?? (nextQ.type === 'proficiency' ? {} : '')) : '')
    setStep(nextStep)
  }

  function goBack() {
    const q = questions[step]
    const newAnswers = { ...answers, [q.id]: currentInput }
    setAnswers(newAnswers)
    const prevStep = getPrevVisibleStep(step, newAnswers)
    const prevQ    = questions[prevStep]
    setCurrentInput(prevQ ? (answers[prevQ.id] ?? (prevQ.type === 'proficiency' ? {} : '')) : '')
    setStep(prevStep)
  }

  /* ── Submit ── */
  async function handleSubmit() {
    const q   = questions[step]
    const all = { ...answers, [q.id]: currentInput }
    setAnswers(all)
    setPending(true)
    setSubmitError('')

    const entries = buildTaskEntries(all, department, staffId)
    if (!entries.length) {
      setSubmitError('Please answer at least a few questions.')
      setPending(false)
      return
    }

    const fd = new FormData()
    fd.set('staff_id', staffId)
    fd.set('tasks', JSON.stringify(entries))

    const result = await submitProfile(fd)
    if (result.error) { setSubmitError(result.error); setPending(false); return }
    setDone(true)
  }

  /* ── Toggle chip ── */
  function toggleChip(val: string) {
    setCurrentInput(prev => {
      const arr: string[] = Array.isArray(prev) ? [...prev] : []
      return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
    })
  }

  /* ── Helpers ── */
  const q = step >= 0 ? questions[step] : null
  const allAnswersWithCurrent = q ? { ...answers, [q.id]: currentInput } : answers
  const nextVisibleStep = q ? getNextVisibleStep(step, allAnswersWithCurrent) : step + 1
  const isLastStep = nextVisibleStep >= questions.length
  const progress   = step >= 0 ? Math.round(((step + 1) / questions.length) * 100) : 0
  const firstName  = staffName.split(' ')[0]

  // Proficiency helpers
  const proficiencyValue: ProfMap = (typeof currentInput === 'object' && !Array.isArray(currentInput) && currentInput !== null && !(currentInput instanceof String))
    ? currentInput as ProfMap : {}
  const proficiencyTools = (Array.isArray(answers['tools']) ? answers['tools'] as string[] : [])
    .filter(t => t !== 'Other').slice(0, 4)

  /* ── canAdvance ── */
  const chipValues: string[] = Array.isArray(currentInput) ? (currentInput as string[]) : []
  const scaleValue: number   = typeof currentInput === 'number' ? currentInput : 0
  const textValue: string    = typeof currentInput === 'string' ? currentInput : ''
  const canAdvance = q
    ? (q.type === 'chips'       ? chipValues.length > 0
      : q.type === 'scale'      ? scaleValue > 0
      : q.type === 'select'     ? textValue !== ''
      : q.type === 'proficiency' ? Object.keys(proficiencyValue).length > 0
      : q.type === 'text'       ? true  // optional — allow skip
      : textValue.trim().length > 0)
    : false

  /* ── Styles ── */
  const S = {
    page:   { fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#0C0E10', minHeight: '100vh', color: 'white' },
    nav:    { background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 40px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    center: { maxWidth: '640px', margin: '0 auto', padding: '0 24px' },
    label:  { fontSize: '11px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase' as const, color: '#00A5A3' },
    input:  { width: '100%', padding: '16px 20px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.15)', fontSize: '15px', color: 'white', outline: 'none', fontFamily: 'inherit', background: 'rgba(255,255,255,0.07)', resize: 'vertical' as const, lineHeight: 1.6, boxSizing: 'border-box' as const },
  }

  /* ───────── DONE SCREEN ───────── */
  if (done) {
    return (
      <div style={{ ...S.page, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '3px solid #C0F43C', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px', background: '#C0F43C15' }}>
          <svg width="36" height="36" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style={S.label}>Intelligence Captured</div>
        <h1 style={{ fontSize: '38px', fontWeight: 800, margin: '16px 0 12px', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
          TAI has heard you,<br /><span style={{ color: '#C0F43C' }}>{firstName}.</span>
        </h1>
        <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: '440px', margin: '0 auto 40px' }}>
          Your answers will shape what gets built first. Every input from the team makes TAI sharper and more specific to how Trescon actually works.
        </p>
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '18px', padding: '24px 28px', marginBottom: '36px', textAlign: 'left', maxWidth: '420px' }}>
          <div style={{ ...S.label, marginBottom: '14px' }}>What happens with your answers</div>
          {[
            'Your intelligence profile is now in the TAI system',
            'Gemini AI will analyse patterns across all staff',
            'Your department\'s top automation wins get surfaced',
            'TAI builds what the team needs most — starting now',
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', padding: '9px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.07)' : 'none', alignItems: 'center' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: i === 0 ? '#C0F43C' : 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: i === 0 ? '#C0F43C' : 'rgba(255,255,255,0.6)', fontWeight: i === 0 ? 600 : 400 }}>{t}</span>
            </div>
          ))}
        </div>
        <Link href={`/dashboard?id=${staffId}`} style={{ background: '#C0F43C', color: '#1E2124', fontSize: '14px', fontWeight: 800, padding: '14px 32px', borderRadius: '50px', textDecoration: 'none' }}>
          Go to My Dashboard
        </Link>
      </div>
    )
  }

  /* ───────── EMAIL VERIFY SCREEN ───────── */
  if (step === -1) {
    return (
      <div style={{ ...S.page, background: '#F2F5F5', color: '#1E2124' }}>
        <nav style={{ background: '#010103', padding: '0 48px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div style={{ width: '28px', height: '28px', background: '#00A5A3', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>TAI</span>
          </Link>
        </nav>
        <div style={{ maxWidth: '500px', margin: '80px auto', padding: '0 24px' }}>
          <div style={S.label}>TAI Intelligence Interview</div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1E2124', margin: '12px 0 8px', lineHeight: 1.2 }}>Enter your work email</h1>
          <p style={{ fontSize: '15px', color: '#666', lineHeight: 1.6, marginBottom: '32px' }}>
            We&apos;ll match it to your Trescon profile and take you straight into your interview. No password needed.
          </p>
          <form onSubmit={handleVerify}>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setVerifyError('') }}
              placeholder="yourname@tresconglobal.com"
              autoFocus
              style={{ width: '100%', padding: '16px 20px', borderRadius: '14px', border: `1.5px solid ${verifyError ? '#FF6B6B' : '#D5D9DB'}`, background: 'white', color: '#1E2124', fontSize: '16px', outline: 'none', fontFamily: 'inherit', marginBottom: '12px', boxSizing: 'border-box' }}
            />
            {verifyError && <p style={{ fontSize: '13px', color: '#E74C3C', marginBottom: '12px', fontWeight: 600 }}>{verifyError}</p>}
            <button type="submit" disabled={verifying || !email.trim()}
              style={{ width: '100%', padding: '16px', borderRadius: '14px', border: 'none', background: '#00A5A3', color: 'white', fontSize: '15px', fontWeight: 800, cursor: verifying ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {verifying ? 'Looking you up...' : (
                <>
                  Start My Intelligence Interview
                  <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </>
              )}
            </button>
          </form>
          <p style={{ marginTop: '16px', fontSize: '13px', color: '#888' }}>
            Haven&apos;t joined yet?{' '}
            <Link href="/join" style={{ color: '#00A5A3', fontWeight: 700, textDecoration: 'none' }}>Join first</Link>
          </p>
        </div>
      </div>
    )
  }

  /* ───────── INTERVIEW SCREEN ───────── */
  return (
    <div style={S.page}>
      {/* Nav */}
      <nav style={S.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div style={{ width: '28px', height: '28px', background: '#00A5A3', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>TAI</span>
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4px' }}>|</span>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>Intelligence Interview</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#C0F43C20', border: '1px solid #C0F43C40', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#C0F43C' }}>{staffName.charAt(0)}</span>
          </div>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{firstName} — {department}</span>
        </div>
      </nav>

      {/* Progress bar */}
      <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #00A5A3, #C0F43C)', transition: 'width 0.4s ease' }} />
      </div>

      <div style={{ ...S.center, paddingTop: '60px', paddingBottom: '80px' }}>

        {/* Step counter */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
            Question {step + 1} of {questions.length}
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#00A5A3', letterSpacing: '1px' }}>
            {progress}% complete
          </div>
        </div>

        {q && (
          <div key={q.id} style={{ animation: 'fadeSlide 0.35s ease' }}>

            {/* Step 0: Training track framing banner */}
            {step === 0 && (
              <div style={{ background: 'rgba(0,165,163,0.07)', border: '1px solid rgba(0,165,163,0.22)', borderRadius: '14px', padding: '14px 18px', marginBottom: '28px' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#00A5A3', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>This is also your training intake</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.65 }}>
                  Your answers place you into a TAI learning track. Be specific — vague answers get basic training. Detailed, honest answers unlock advanced tracks and leadership roles in the AI rollout.
                </div>
              </div>
            )}

            {/* TAI asking indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg, #00A5A3, #005F7A)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: '#00A5A3', textTransform: 'uppercase' }}>TAI Intelligence</span>
            </div>

            {/* Question text */}
            <h2 style={{ fontSize: '26px', fontWeight: 800, lineHeight: 1.3, marginBottom: '10px', letterSpacing: '-0.3px' }}>
              {q.question}
            </h2>
            {(() => {
              // Dynamic subtext for ownership_intent based on readiness level
              const displaySubtext = (q.id === 'ownership_intent' && typeof answers['ai_readiness'] === 'number' && (answers['ai_readiness'] as number) >= 3)
                ? "Since you're already using AI, name one specific process in your role you'd want to automate first with TAI's support. This goes on record."
                : q.subtext
              return displaySubtext
                ? <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, marginBottom: '28px' }}>{displaySubtext}</p>
                : <div style={{ height: '28px' }} />
            })()}

            {/* ── TEXTAREA ── */}
            {q.type === 'textarea' && (
              <textarea
                ref={inputRef}
                rows={5}
                value={textValue}
                onChange={e => setCurrentInput(e.target.value)}
                placeholder={q.placeholder ?? ''}
                style={{ ...S.input, minHeight: '140px' }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canAdvance) {
                    e.preventDefault()
                    isLastStep ? handleSubmit() : saveCurrentAndAdvance()
                  }
                }}
              />
            )}

            {/* ── TEXT (short, optional) ── */}
            {q.type === 'text' && (
              <input
                type="text"
                value={textValue}
                onChange={e => setCurrentInput(e.target.value)}
                placeholder={q.placeholder ?? ''}
                style={{ ...S.input, resize: 'none' }}
              />
            )}

            {/* ── CHIPS ── */}
            {q.type === 'chips' && (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {(q.options ?? []).map(opt => {
                  const sel = chipValues.includes(opt)
                  return (
                    <button
                      key={opt} type="button" onClick={() => toggleChip(opt)}
                      style={{
                        padding: '10px 18px', borderRadius: '50px',
                        border: `1.5px solid ${sel ? '#C0F43C' : 'rgba(255,255,255,0.15)'}`,
                        background: sel ? '#C0F43C15' : 'transparent',
                        color: sel ? '#C0F43C' : 'rgba(255,255,255,0.55)',
                        fontSize: '13px', fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
            )}

            {/* ── SELECT ── */}
            {q.type === 'select' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(q.options ?? []).map(opt => {
                  const sel = textValue === opt
                  return (
                    <button
                      key={opt} type="button" onClick={() => setCurrentInput(opt)}
                      style={{
                        padding: '14px 20px', borderRadius: '14px', textAlign: 'left',
                        border: `1.5px solid ${sel ? '#00A5A3' : 'rgba(255,255,255,0.1)'}`,
                        background: sel ? 'rgba(0,165,163,0.12)' : 'rgba(255,255,255,0.03)',
                        color: sel ? 'white' : 'rgba(255,255,255,0.6)',
                        fontSize: '14px', fontWeight: sel ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {opt}
                      {sel && (
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#00A5A3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="10" height="10" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* ── SCALE ── */}
            {q.type === 'scale' && (
              <div>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  {(q.options ?? []).map((label, i) => {
                    const n   = i + 1
                    const sel = scaleValue === n
                    const col = SCALE_COLORS[i]
                    return (
                      <button
                        key={n} type="button" onClick={() => setCurrentInput(n)}
                        style={{
                          flex: '1 1 120px', padding: '14px 10px', borderRadius: '14px', textAlign: 'center',
                          border: `1.5px solid ${sel ? col : 'rgba(255,255,255,0.1)'}`,
                          background: sel ? `${col}18` : 'rgba(255,255,255,0.03)',
                          cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ fontSize: '22px', fontWeight: 800, color: sel ? col : 'rgba(255,255,255,0.3)', marginBottom: '6px' }}>{n}</div>
                        <div style={{ fontSize: '11px', color: sel ? col : 'rgba(255,255,255,0.35)', fontWeight: sel ? 700 : 400, lineHeight: 1.4 }}>{label}</div>
                      </button>
                    )
                  })}
                </div>
                {scaleValue > 0 && (
                  <div style={{ background: `${SCALE_COLORS[scaleValue - 1]}15`, border: `1px solid ${SCALE_COLORS[scaleValue - 1]}30`, borderRadius: '12px', padding: '12px 16px', fontSize: '13px', color: SCALE_COLORS[scaleValue - 1], fontWeight: 600 }}>
                    {(q.options ?? [])[scaleValue - 1]}
                  </div>
                )}
                {/* Accountability callout for levels 4–5 */}
                {q.id === 'ai_readiness' && scaleValue >= 4 && (
                  <div style={{ marginTop: '14px', background: 'rgba(192,244,60,0.07)', border: '1px solid rgba(192,244,60,0.25)', borderRadius: '12px', padding: '14px 18px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#C0F43C', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>You are now on the advanced track</div>
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                      The next question will ask you to describe a real AI workflow you use. This becomes your starting brief for TAI&apos;s advanced training path — and you will be expected to lead an AI pilot in your department.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── PROFICIENCY ── */}
            {q.type === 'proficiency' && (
              <ProficiencyInput
                tools={proficiencyTools}
                value={proficiencyValue}
                onChange={(updated) => setCurrentInput(updated)}
              />
            )}

            {/* Hint for textarea */}
            {q.type === 'textarea' && (
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', marginTop: '10px' }}>
                Press Cmd+Enter to continue
              </p>
            )}

            {/* Optional hint for text */}
            {q.type === 'text' && (
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '10px' }}>
                Optional — skip if nothing to add
              </p>
            )}

            {/* Error */}
            {submitError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 16px', marginTop: '16px', fontSize: '13px', color: '#C0392B', fontWeight: 600 }}>
                {submitError}
              </div>
            )}

            {/* Nav buttons */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '32px', alignItems: 'center', justifyContent: 'space-between' }}>
              {step > 0 ? (
                <button type="button" onClick={goBack} style={{ padding: '12px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
                  Back
                </button>
              ) : <div />}

              <button
                type="button"
                disabled={!canAdvance && q.type !== 'text' && !pending}
                onClick={isLastStep ? handleSubmit : saveCurrentAndAdvance}
                style={{
                  padding: '14px 28px', borderRadius: '14px', border: 'none',
                  background: (canAdvance || q.type === 'text') && !pending ? (isLastStep ? '#C0F43C' : '#00A5A3') : 'rgba(255,255,255,0.1)',
                  color: (canAdvance || q.type === 'text') && !pending ? (isLastStep ? '#1E2124' : 'white') : 'rgba(255,255,255,0.25)',
                  fontSize: '14px', fontWeight: 800, cursor: (canAdvance || q.type === 'text') && !pending ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px',
                  transition: 'all 0.2s ease',
                }}
              >
                {pending ? 'Submitting to TAI...' : isLastStep ? (
                  <>
                    Submit to TAI
                    <svg width="14" height="14" fill="none" stroke="#1E2124" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  </>
                ) : (
                  <>
                    {q.type === 'text' ? 'Skip / Next' : 'Next'}
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                  </>
                )}
              </button>
            </div>

          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default function ProfilePage() {
  return (
    <Suspense>
      <ProfileContent />
    </Suspense>
  )
}
