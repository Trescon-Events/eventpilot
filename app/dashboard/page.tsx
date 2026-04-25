'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

/* ─── Types ──────────────────────────────────────────────────── */
interface StaffMember {
  id: string
  name: string
  department: string
  role: string
  office_id: string
}

interface TaskProfile {
  ai_readiness: number
  tools_used: string[]
  tool_proficiency: Record<string, number>
}

interface Course {
  id: string
  title: string
  subtitle: string
  tool_name: string | null
  tier_level: 'foundation' | 'adoption' | 'advanced'
  dept_tags: string[]
  is_mandatory: boolean
  estimated_minutes: number
  overview: string
  source: string
}

interface Completion {
  course_id: string
  passed: boolean
  test_score: number | null
  attempt_count: number
}

/* ─── Tier config ─────────────────────────────────────────────── */
const TIERS = {
  'AI-Forward':  { color: '#C0F43C', bg: '#C0F43C15', border: '#C0F43C40', min: 75 },
  'AI-Ready':    { color: '#00A5A3', bg: '#00A5A315', border: '#00A5A340', min: 55 },
  'AI-Aware':    { color: '#F4ED3C', bg: '#F4ED3C15', border: '#F4ED3C40', min: 35 },
  'AI-Curious':  { color: '#FF9F43', bg: '#FF9F4315', border: '#FF9F4340', min: 15 },
  'AI-Unaware':  { color: '#FF6B6B', bg: '#FF6B6B15', border: '#FF6B6B40', min: 0  },
}

function getTier(score: number) {
  if (score >= 75) return 'AI-Forward'
  if (score >= 55) return 'AI-Ready'
  if (score >= 35) return 'AI-Aware'
  if (score >= 15) return 'AI-Curious'
  return 'AI-Unaware'
}

function getLearningTrack(tier: string): 'foundation' | 'adoption' | 'advanced' {
  if (tier === 'AI-Unaware' || tier === 'AI-Curious')  return 'foundation'
  if (tier === 'AI-Aware')                              return 'adoption'
  return 'advanced'
}

function computeTAIRS(tasks: TaskProfile[]): number {
  if (!tasks.length) return 0
  const avg = tasks.reduce((s, t) => s + (t.ai_readiness ?? 1), 0) / tasks.length
  return Math.round(((avg - 1) / 4) * 65 + 10)
}

const TRACK_LABEL: Record<string, string> = {
  foundation: 'Foundation Track',
  adoption:   'Adoption Track',
  advanced:   'Advanced Track',
}

/* ─── Tip of the day ─────────────────────────────────────────── */
const DAILY_TIPS = [
  { title: 'Use ChatGPT for recap emails', body: 'After every meeting, paste your rough notes and ask ChatGPT to "write a professional recap email with action items". Send it in seconds, not 20 minutes.' },
  { title: 'The magic phrase: "Think step by step"', body: 'Adding "think step by step" to any complex question forces AI to reason instead of guess. Use it whenever you need a plan, analysis, or decision.' },
  { title: 'Your prompt is your brief', body: 'A vague brief gets a vague answer — from AI or from a human. Treat every AI prompt like a proper task brief: who, what, format, context.' },
  { title: 'AI for five-option thinking', body: 'Stuck on a decision? Ask: "Give me 5 different approaches to [problem], with pros and cons of each." You pick the winner — AI expands your option set.' },
  { title: 'Rewrite anything in a new tone', body: 'Paste any text and say "Rewrite this to be more concise and direct" or "...more warm and conversational". Instant copyediting.' },
  { title: 'Summarise long email threads', body: 'Paste a long email chain into ChatGPT and ask: "Summarise the key decisions made and outstanding actions." Works for WhatsApp threads too.' },
  { title: 'AI knows every tool\'s shortcuts', body: 'Ask ChatGPT "What are the 10 most useful shortcuts in Excel/Canva/Figma I probably don\'t know?" You\'ll always find at least three new ones.' },
]

/* ── No-ID landing: auto-detect from localStorage or ask for email ── */
function NoIdScreen() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('tai_staff_id')
    if (stored) window.location.href = `/dashboard?id=${stored}`
  }, [])

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/verify-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Email not found. Have you joined at /join?'); setLoading(false); return }
      localStorage.setItem('tai_staff_id', data.id)
      window.location.href = `/dashboard?id=${data.id}`
    } catch {
      setError('Something went wrong. Try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#0D0F10', minHeight: '100vh', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', background: '#00A5A3', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#00A5A3', marginBottom: '8px' }}>TAI Academy</div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'white', margin: '0 0 10px' }}>My Learning Dashboard</h1>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 28px' }}>Enter your work email to access your dashboard.</p>
        <form onSubmit={handleEmail} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@tresconglobal.com"
            style={{ flex: 1, padding: '11px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{ padding: '11px 20px', borderRadius: '10px', background: '#00A5A3', color: 'white', fontSize: '13px', fontWeight: 700, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: loading ? 0.7 : 1 }}>
            {loading ? '...' : 'Go'}
          </button>
        </form>
        {error && <p style={{ marginTop: '12px', fontSize: '13px', color: '#FF6B6B' }}>{error}</p>}
        <div style={{ marginTop: '24px', padding: '14px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
          Not joined yet?{' '}
          <Link href="/join" style={{ color: '#00A5A3', textDecoration: 'none', fontWeight: 700 }}>Join TAI Academy</Link>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════ */
function DashboardContent() {
  const params = useSearchParams()
  const staffId = params.get('id')

  const [staff,       setStaff]       = useState<StaffMember | null>(null)
  const [tasks,       setTasks]       = useState<TaskProfile[]>([])
  const [courses,     setCourses]     = useState<Course[]>([])
  const [completions, setCompletions] = useState<Completion[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const isAdmin = typeof window !== 'undefined' && sessionStorage.getItem('tai_admin_authed') === '1'

  const tip = DAILY_TIPS[new Date().getDate() % DAILY_TIPS.length]

  useEffect(() => {
    if (!staffId) { setError('No staff ID provided. Please access this page via your dashboard link.'); setLoading(false); return }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId])

  async function load() {
    try {
      // Staff member
      const sRes = await fetch(`/api/staff-member?id=${staffId}`)
      if (!sRes.ok) { setError('Staff member not found.'); setLoading(false); return }
      const sData = await sRes.json()
      setStaff(sData.staff)
      setTasks(sData.tasks ?? [])

      const score = computeTAIRS(sData.tasks ?? [])
      const track = getLearningTrack(getTier(score))

      // Admins see all courses; staff see their tier only
      const courseUrl = isAdmin ? '/api/courses' : `/api/courses?tier=${track}`
      const cRes = await fetch(courseUrl)
      const cData = await cRes.json()
      setCourses(Array.isArray(cData) ? cData : [])

      // Completions
      const compRes = await fetch(`/api/staff-completions?staff_id=${staffId}`)
      if (compRes.ok) {
        const compData = await compRes.json()
        setCompletions(Array.isArray(compData) ? compData : [])
      }
    } catch {
      setError('Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }

  if (!staffId) {
    return <NoIdScreen />
  }

  if (loading) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#00A5A3', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>Loading your dashboard…</div>
        </div>
      </div>
    )
  }

  if (error || !staff) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '0 24px' }}>
          <div style={{ fontSize: '13px', color: '#FF6B6B', marginBottom: '12px' }}>Error</div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '15px' }}>{error || 'Something went wrong.'}</p>
        </div>
      </div>
    )
  }

  const score      = computeTAIRS(tasks)
  const tier       = getTier(score)
  const track      = getLearningTrack(tier)
  const tierConfig = TIERS[tier as keyof typeof TIERS]
  const firstName  = staff.name.split(' ')[0]

  const completedIds  = new Set(completions.filter(c => c.passed).map(c => c.course_id))
  const nextCourse    = courses.find(c => !completedIds.has(c.id))
  const completedCount = completions.filter(c => c.passed).length
  const totalMandatory = courses.filter(c => c.is_mandatory).length
  const completedMandatory = courses.filter(c => c.is_mandatory && completedIds.has(c.id)).length

  return (
    <div style={S.page}>
      {/* ── Nav ── */}
      <nav style={S.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', background: '#00A5A3', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <span style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>TAI</span>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>My Dashboard</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href={`/dashboard/library?id=${staffId}`} style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>
            Course Library
          </Link>
          <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: `${tierConfig.color}20`, border: `1px solid ${tierConfig.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: tierConfig.color }}>{firstName.charAt(0)}</span>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* ── Hero ── */}
        <div style={{ background: 'linear-gradient(135deg, #0D1F2D 0%, #0B1A26 100%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '32px', marginBottom: '24px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '24px', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#00A5A3', marginBottom: '8px' }}>
              Welcome back
            </div>
            <h1 style={{ fontSize: '30px', fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.5px', color: 'white' }}>
              {staff.name}
            </h1>
            <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', marginBottom: '20px' }}>
              {staff.role} · {staff.department}
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ background: tierConfig.bg, border: `1px solid ${tierConfig.border}`, borderRadius: '10px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px', fontWeight: 900, color: tierConfig.color }}>{score}</span>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: tierConfig.color }}>{tier}</div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>AI Readiness Score</div>
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '8px 16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{TRACK_LABEL[track]}</div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>Current learning track</div>
              </div>
            </div>
          </div>
          {/* Circular score ring */}
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <ScoreRing score={score} color={tierConfig.color} />
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Courses Completed',  value: completedCount,                         sub: 'in your library'        },
            { label: 'Mandatory Progress', value: `${completedMandatory}/${totalMandatory}`, sub: 'mandatory courses'   },
            { label: 'Current Track',      value: track.charAt(0).toUpperCase() + track.slice(1), sub: 'learning level' },
          ].map(({ label, value, sub }) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '18px 20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '6px' }}>{label}</div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: 'white', marginBottom: '2px' }}>{value}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* ── Two column: Next Up + Tip ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '16px', marginBottom: '24px' }}>

          {/* Next Up */}
          {nextCourse ? (
            <div style={{ background: 'linear-gradient(135deg, #0A1E2B, #091928)', border: `1px solid ${tierConfig.border}`, borderRadius: '18px', padding: '28px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: tierConfig.color, textTransform: 'uppercase', marginBottom: '12px' }}>
                Next Up · {TRACK_LABEL[track]}
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'white', margin: '0 0 6px', lineHeight: 1.25 }}>
                {nextCourse.title}
              </h2>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', margin: '0 0 8px', lineHeight: 1.5 }}>
                {nextCourse.subtitle}
              </p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.07)', padding: '3px 10px', borderRadius: '20px' }}>
                  {nextCourse.estimated_minutes} min
                </span>
                {nextCourse.is_mandatory && (
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#FF9F43', background: '#FF9F4315', padding: '3px 10px', borderRadius: '20px' }}>
                    Mandatory
                  </span>
                )}
                {nextCourse.tool_name && (
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.07)', padding: '3px 10px', borderRadius: '20px' }}>
                    {nextCourse.tool_name}
                  </span>
                )}
              </div>
              <Link
                href={`/dashboard/course/${nextCourse.id}?staff_id=${staffId}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '13px 24px', background: tierConfig.color, color: score >= 55 ? 'white' : '#1E2124', borderRadius: '12px', textDecoration: 'none', fontWeight: 800, fontSize: '14px' }}
              >
                Start Course
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
              </Link>
            </div>
          ) : (
            <div style={{ background: 'rgba(192,244,60,0.05)', border: '1px solid rgba(192,244,60,0.2)', borderRadius: '18px', padding: '28px', display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#C0F43C20', border: '2px solid #C0F43C40', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="22" height="22" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#C0F43C', marginBottom: '6px' }}>Track Complete!</div>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.55 }}>
                  You've completed all {track} track courses. Explore the full library for more.
                </p>
                <Link href={`/dashboard/library?id=${staffId}`} style={{ display: 'inline-block', marginTop: '14px', fontSize: '13px', fontWeight: 700, color: '#C0F43C', textDecoration: 'underline' }}>
                  Browse Library
                </Link>
              </div>
            </div>
          )}

          {/* Daily tip */}
          <div style={{ background: 'rgba(0,165,163,0.07)', border: '1px solid rgba(0,165,163,0.18)', borderRadius: '18px', padding: '24px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: '#00A5A3', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="12" height="12" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              TAI Daily Tip
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'white', marginBottom: '10px', lineHeight: 1.3 }}>
              {tip.title}
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.65 }}>
              {tip.body}
            </p>
          </div>
        </div>

        {/* ── My Learning Path ── */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'white', margin: 0 }}>{isAdmin ? 'All Courses' : 'My Learning Path'}</h2>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>{isAdmin ? `Full library · ${courses.length} courses` : `${TRACK_LABEL[track]} · ${courses.length} courses`}</div>
            </div>
            <Link href={`/dashboard/library?id=${staffId}`} style={{ fontSize: '13px', fontWeight: 700, color: '#00A5A3', textDecoration: 'none' }}>
              View All
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(isAdmin ? courses : courses.slice(0, 5)).map((course, idx) => {
              const done    = completedIds.has(course.id)
              const isNext  = !done && courses.find(c => !completedIds.has(c.id))?.id === course.id
              return (
                <Link
                  key={course.id}
                  href={`/dashboard/course/${course.id}?staff_id=${staffId}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '36px 1fr auto',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '16px 20px',
                    background: isNext ? `${tierConfig.bg}` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isNext ? tierConfig.border : 'rgba(255,255,255,0.07)'}`,
                    borderRadius: '14px',
                    textDecoration: 'none',
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  {/* Step number / checkmark */}
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: done ? '#C0F43C20' : isNext ? `${tierConfig.color}20` : 'rgba(255,255,255,0.06)', border: `2px solid ${done ? '#C0F43C' : isNext ? tierConfig.color : 'rgba(255,255,255,0.12)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {done
                      ? <svg width="14" height="14" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      : <span style={{ fontSize: '13px', fontWeight: 800, color: isNext ? tierConfig.color : 'rgba(255,255,255,0.35)' }}>{idx + 1}</span>
                    }
                  </div>
                  {/* Title */}
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: done ? 'rgba(255,255,255,0.55)' : 'white', marginBottom: '2px' }}>{course.title}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{course.estimated_minutes} min · {course.is_mandatory ? 'Mandatory' : 'Optional'}</div>
                  </div>
                  {/* Status */}
                  <div style={{ fontSize: '11px', fontWeight: 700, color: done ? '#C0F43C' : isNext ? tierConfig.color : 'rgba(255,255,255,0.25)', textAlign: 'right', flexShrink: 0 }}>
                    {done ? 'Done' : isNext ? 'Up Next' : 'Locked'}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {/* ── What improves your score ── */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '18px', padding: '24px 28px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'white', margin: '0 0 16px' }}>How to move up from {tier}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {getImprovementTips(tier).map((tip, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: tierConfig.color, marginTop: '5px', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.78)', lineHeight: 1.55 }}>{tip}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

/* ── Score ring SVG ── */
function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 42
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  return (
    <svg width="110" height="110" viewBox="0 0 110 110">
      <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
      <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 55 55)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
      <text x="55" y="50" textAnchor="middle" fill="white" fontSize="22" fontWeight="900" fontFamily="Manrope,sans-serif">{score}</text>
      <text x="55" y="66" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="10" fontFamily="Manrope,sans-serif">/ 100</text>
    </svg>
  )
}

function getImprovementTips(tier: string): string[] {
  const tips: Record<string, string[]> = {
    'AI-Unaware': [
      'Complete the Foundation track courses (2 mandatory)',
      'Use ChatGPT for one task every day this week',
      'Take the AI Basics course and score 70%+',
      'Write down 3 repetitive tasks AI could speed up',
    ],
    'AI-Curious': [
      'Complete all Foundation track courses',
      'Use at least 2 different AI tools in your workflow',
      'Document one time-saving prompt that works for your role',
      'Move to Adoption track by scoring 35+',
    ],
    'AI-Aware': [
      'Complete the Adoption track and score 70%+ on tests',
      'Set up one workflow automation (Zapier or Make)',
      'Master 5 advanced prompting techniques',
      'Identify and map your department\'s biggest automation win',
    ],
    'AI-Ready': [
      'Complete the Advanced track courses',
      'Run a real AI pilot in your department',
      'Present results to your manager and team',
      'Become the AI champion for your department',
    ],
    'AI-Forward': [
      'Lead a cross-department AI pilot',
      'Mentor 2 colleagues on their learning path',
      'Build a repeatable AI workflow others can use',
      'Contribute a custom course to the TAI library',
    ],
  }
  return tips[tier] ?? tips['AI-Curious']
}

/* ── Styles ── */
const S = {
  page: {
    fontFamily: 'var(--font-manrope), Manrope, sans-serif',
    background: '#0C0E10',
    minHeight:  '100vh',
    color:      'white',
  },
  nav: {
    background:   'rgba(255,255,255,0.03)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    padding:      '0 32px',
    height:       '56px',
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'space-between',
  },
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  )
}
