'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { computeTAIRS, getTier, getTrack, TIER_COLORS } from '@/app/lib/tairs'
import PlatformMenu from '@/app/components/PlatformMenu'

/* ─── Types ──────────────────────────────────────────────────── */
interface StaffMember {
  id: string
  name: string
  department: string
  role: string
  office_id: string
  has_reports: boolean
  manager_id: string | null
  job_level: string
  team: string | null
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
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#F6FFFE', minHeight: '100vh', color: '#1E2124', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', background: '#00A5A3', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#00A5A3', marginBottom: '8px' }}>Trescademy</div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#1E2124', margin: '0 0 10px' }}>My Learning Dashboard</h1>
        <p style={{ fontSize: '16px', color: '#464D53', lineHeight: 1.65, margin: '0 0 28px' }}>Enter your work email to access your dashboard.</p>
        <form onSubmit={handleEmail} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@tresconglobal.com"
            style={{ flex: 1, padding: '11px 16px', borderRadius: '10px', border: '1px solid #E6EFF0', background: '#FFFFFF', color: '#1E2124', fontSize: '15px', fontFamily: 'inherit', outline: 'none' }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{ padding: '11px 20px', borderRadius: '10px', background: '#00A5A3', color: 'white', fontSize: '15px', fontWeight: 700, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: loading ? 0.7 : 1 }}>
            {loading ? '...' : 'Go'}
          </button>
        </form>
        {error && <p style={{ marginTop: '12px', fontSize: '15px', color: '#FF6B6B' }}>{error}</p>}
        <div style={{ marginTop: '24px', padding: '14px 18px', background: '#FFFFFF', border: '1px solid #E6EFF0', borderRadius: '12px', fontSize: '14px', color: '#64748B', lineHeight: 1.65 }}>
          Use the email address your manager registered you with. Contact IT if you cannot access your account.
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════ */
function DashboardContent() {
  const params = useSearchParams()
  const staffId = params.get('id')

  const [staff,          setStaff]          = useState<StaffMember | null>(null)
  const [tasks,          setTasks]          = useState<TaskProfile[]>([])
  const [courses,        setCourses]        = useState<Course[]>([])
  const [completions,    setCompletions]    = useState<Completion[]>([])
  const [recPrimary,     setRecPrimary]     = useState<(Course & { rec_reason: string; rec_label: string }) | null>(null)
  const [recList,        setRecList]        = useState<(Course & { rec_reason: string; rec_label: string })[]>([])
  const [recContext,     setRecContext]      = useState<{ mandatory_total: number; mandatory_completed: number; dept_courses: number; dept_completed: number } | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState('')
  const [notifications,  setNotifications]  = useState<{ id: string; title: string; body: string; course_id: string | null }[]>([])
  const [aiRecsLoading,  setAiRecsLoading]  = useState(false)
  const [aiRecsReady,    setAiRecsReady]    = useState(false)
  const [isDemo,         setIsDemo]         = useState(false)
  // Knowledge base + events
  type DocItem   = { id: string; title: string; type: string; word_count: number; events?: { name: string } | null }
  type EventItem = { id: string; name: string; type: string; status: string; event_date: string | null; city: string | null; my_role: string | null }
  type MyChecklistItem = {
    id: string; department: string; title: string; status: string
    due_date: string | null; notes: string | null
    events: { id: string; name: string; type: string; event_date: string | null; city: string | null; status: string } | null
  }
  const [docs,            setDocs]            = useState<DocItem[]>([])
  const [events,          setEvents]          = useState<EventItem[]>([])
  const [myChecklist,     setMyChecklist]     = useState<MyChecklistItem[]>([])
  const [checklistNotes,  setChecklistNotes]  = useState<Record<string, string>>({})
  const [checklistSaving, setChecklistSaving] = useState<Record<string, boolean>>({})
  const [feedbackText,  setFeedbackText]  = useState('')
  const [feedbackSent,  setFeedbackSent]  = useState(false)
  const [feedbackSending, setFeedbackSending] = useState(false)
  const [dismissedIds,  setDismissedIds]  = useState<Set<string>>(new Set())
  const isAdmin = typeof window !== 'undefined' && sessionStorage.getItem('tai_admin_authed') === '1'

  const tip = DAILY_TIPS[new Date().getDate() % DAILY_TIPS.length]

  useEffect(() => {
    if (!staffId) { setError('No staff ID provided. Please access this page via your dashboard link.'); setLoading(false); return }
    const stored = localStorage.getItem(`tresci_dismissed_${staffId}`)
    if (stored) setDismissedIds(new Set(JSON.parse(stored)))
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId])

  function dismissCourse(courseId: string) {
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.add(courseId)
      localStorage.setItem(`tresci_dismissed_${staffId}`, JSON.stringify([...next]))
      return next
    })
  }

  async function load() {
    try {
      const [res, statusRes, docsRes, eventsRes, clRes] = await Promise.all([
        fetch(`/api/dashboard?id=${staffId}`),
        fetch('/api/platform-status'),
        fetch(`/api/documents/list?staff_id=${staffId}`),
        fetch(`/api/events?staff_id=${staffId}`),
        fetch(`/api/events/my-checklist?staff_id=${staffId}`),
      ])
      if (docsRes.ok)   { const d = await docsRes.json();   setDocs(Array.isArray(d) ? d : []) }
      if (eventsRes.ok) { const e = await eventsRes.json(); setEvents(Array.isArray(e) ? e : []) }
      if (clRes.ok) {
        const cl = await clRes.json()
        if (Array.isArray(cl)) {
          setMyChecklist(cl)
          const notes: Record<string, string> = {}
          cl.forEach((i: MyChecklistItem) => { notes[i.id] = i.notes ?? '' })
          setChecklistNotes(notes)
        }
      }
      if (!res.ok) { setError('Staff member not found.'); setLoading(false); return }
      const data = await res.json()
      const status = statusRes.ok ? await statusRes.json() : { is_demo: false }
      setIsDemo(status.is_demo ?? false)

      // Gate: no task profiles = questionnaire not completed → redirect
      // Always return to personal dashboard after questionnaire so they see their TAIRS score first
      const tasks: TaskProfile[] = data.tasks ?? []
      const isAdminSession = sessionStorage.getItem('tai_admin_authed') === '1'
      if (tasks.length === 0 && staffId && staffId !== 'super-admin' && !isAdminSession) {
        const s    = data.staff
        const name = encodeURIComponent(s?.name ?? '')
        const dept = encodeURIComponent(s?.department ?? 'Other')
        window.location.href = `/profile?id=${staffId}&name=${name}&dept=${dept}&next=${encodeURIComponent(`/dashboard?id=${staffId}`)}`
        return
      }

      setStaff(data.staff)
      setTasks(data.tasks ?? [])
      setCourses(Array.isArray(data.courses) ? data.courses : [])
      setCompletions(Array.isArray(data.completions) ? data.completions : [])
      setRecPrimary(data.recommendations?.primary ?? null)
      setRecList(data.recommendations?.list ?? [])
      setRecContext(data.recommendations?.context ?? null)
      setNotifications(data.notifications ?? [])
      setLoading(false)
      /* Fire AI recommendations async — dashboard shows immediately, recs upgrade in background */
      loadAiRecs()
    } catch {
      setError('Failed to load dashboard data.')
      setLoading(false)
    }
  }

  async function loadAiRecs() {
    if (!staffId || staffId === 'super-admin') return
    setAiRecsLoading(true)
    try {
      const res = await fetch('/api/recommendations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ staff_id: staffId }),
      })
      if (!res.ok) return
      const data = await res.json()
      const recs: (Course & { rec_reason: string; rec_label: string })[] = data.recommendations ?? []
      if (recs.length > 0) {
        setRecPrimary(recs[0])
        setRecList(recs.slice(1))
        setAiRecsReady(true)
      }
    } catch {
      /* Silently fail — rule-based recs remain */
    } finally {
      setAiRecsLoading(false)
    }
  }

  if (!staffId) {
    return <NoIdScreen />
  }

  if (loading) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid rgba(15,23,42,0.1)', borderTopColor: '#00A5A3', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: '#464D53', fontSize: '16px' }}>Loading your dashboard…</div>
        </div>
      </div>
    )
  }

  if (error || !staff) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '0 24px' }}>
          <div style={{ fontSize: '15px', color: '#FF6B6B', marginBottom: '12px' }}>Error</div>
          <p style={{ color: '#464D53', fontSize: '17px' }}>{error || 'Something went wrong.'}</p>
        </div>
      </div>
    )
  }

  async function dismissNotification(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id))
    await fetch('/api/notifications', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ staff_id: staffId, notification_id: id }),
    })
  }

  const score      = computeTAIRS(tasks)
  const tier       = getTier(score)
  const track      = getTrack(score)
  const tierConfig = TIER_COLORS[tier]
  const firstName  = staff.name.split(' ')[0]

  const completedIds    = new Set(completions.filter(c => c.passed).map(c => c.course_id))
  const nextCourse      = recPrimary ?? courses.find(c => !completedIds.has(c.id)) ?? null
  const completedCount  = completions.filter(c => c.passed).length
  const totalMandatory  = recContext?.mandatory_total  ?? courses.filter(c => c.is_mandatory).length
  const completedMandatory = recContext?.mandatory_completed ?? courses.filter(c => c.is_mandatory && completedIds.has(c.id)).length

  const REC_LABEL_COLOR: Record<string, string> = {
    mandatory:       '#FF9F43',
    dept:            '#00A5A3',
    track:           tierConfig.color,
    foundation_gap:  '#F4ED3C',
    role:            '#A478FF',
  }

  return (
    <div style={S.page}>
      {/* ── Nav ── */}
      <nav style={S.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ background: 'white', borderRadius: '8px', padding: '4px 10px', display: 'flex', alignItems: 'center' }}>
              <img src="/trescon-logo.png" alt="Trescon" style={{ height: '40px', width: 'auto', display: 'block' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '24px', height: '24px', background: '#00A5A3', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#1E2124' }}>Trescademy</span>
            </div>
          </div>
          <span style={{ color: 'rgba(15,23,42,0.16)' }}>|</span>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#464D53' }}>{isAdmin ? 'Personal View' : 'My Dashboard'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {(staff.has_reports || isAdmin) && (
            <Link href={`/team?manager_id=${staffId}&staff_id=${staffId}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 700, color: '#A478FF', background: 'rgba(164,120,255,0.12)', border: '1px solid rgba(164,120,255,0.3)', padding: '6px 14px', borderRadius: '20px', textDecoration: 'none' }}>
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Team Dashboard
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 700, color: '#C0F43C', background: 'rgba(192,244,60,0.12)', border: '1px solid rgba(192,244,60,0.3)', padding: '6px 14px', borderRadius: '20px', textDecoration: 'none' }}>
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              Admin Dashboard
            </Link>
          )}
          <PlatformMenu staffId={staffId} />
          <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: `${tierConfig.color}20`, border: `1px solid ${tierConfig.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: tierConfig.color }}>{firstName.charAt(0)}</span>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('trescademy_staff_id')
              localStorage.removeItem('tai_staff_id')
              sessionStorage.removeItem('tai_admin_authed')
              sessionStorage.removeItem('tai_admin_staff_id')
              window.location.href = '/login'
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '10px', background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <svg width="13" height="13" fill="none" stroke="#FF6B6B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
              <line x1="12" y1="2" x2="12" y2="12"/>
            </svg>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#FF6B6B' }}>Sign out</span>
          </button>
        </div>
      </nav>

      {/* ── Demo mode banner — auto-hides once real staff data is imported ── */}
      {isDemo && (
        <div style={{ background: 'rgba(255,159,67,0.08)', borderBottom: '1px solid rgba(255,159,67,0.25)', padding: '10px 32px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="14" height="14" fill="none" stroke="#FF9F43" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#FF9F43', animation: 'demoGlow 3s linear infinite' }}>Demo Mode</span>
          <span style={{ fontSize: '14px', color: '#464D53' }}>The data shown on this dashboard is sample data for demonstration purposes only. It does not represent any real individual or organisation.</span>
        </div>
      )}

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* ── Notification banners ── */}
        {notifications.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
            {notifications.map(n => (
              <div key={n.id} style={{ background: 'linear-gradient(135deg, rgba(192,244,60,0.08) 0%, rgba(0,165,163,0.06) 100%)', border: '1px solid rgba(192,244,60,0.25)', borderRadius: '14px', padding: '16px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(192,244,60,0.15)', border: '1px solid rgba(192,244,60,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="16" height="16" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#C0F43C', marginBottom: '4px' }}>{n.title}</div>
                  <div style={{ fontSize: '15px', color: '#464D53', lineHeight: 1.65 }}>{n.body}</div>
                  {n.course_id && (
                    <a href={`/dashboard/course/${n.course_id}${staffId ? `?staff_id=${staffId}` : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '10px', fontSize: '14px', fontWeight: 700, color: '#C0F43C', textDecoration: 'none' }}>
                      View Course
                      <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                    </a>
                  )}
                </div>
                <button
                  onClick={() => dismissNotification(n.id)}
                  style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#EEF9F9', border: '1px solid #E6EFF0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  <svg width="11" height="11" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Hero ── */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E6EFF0', borderRadius: '20px', padding: '32px', marginBottom: '24px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '24px', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#00A5A3', marginBottom: '8px' }}>
              {completedCount === 0 ? 'Welcome to Trescademy' : 'Welcome back'}
            </div>
            <h1 style={{ fontSize: '32px', fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.5px', color: '#1E2124' }}>
              {staff.name}
            </h1>
            <div style={{ fontSize: '17px', color: '#464D53', marginBottom: '20px' }}>
              {staff.role} · {staff.department}
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ background: tierConfig.bg, border: `1px solid ${tierConfig.border}`, borderRadius: '10px', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '28px', fontWeight: 900, color: tierConfig.color }}>{score}</span>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: tierConfig.color }}>{tier}</div>
                  <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.75)' }}>AI Readiness Score · 0–100</div>
                </div>
              </div>
              <div style={{ background: '#EEF9F9', border: '1px solid #E6EFF0', borderRadius: '10px', padding: '10px 18px' }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#1E2124' }}>{TRACK_LABEL[track]}</div>
                <div style={{ fontSize: '14px', color: '#464D53' }}>Current learning track</div>
              </div>
            </div>
          </div>
          {/* Circular score ring */}
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <ScoreRing score={score} color={tierConfig.color} />
            <div style={{ fontSize: '14px', color: '#464D53', marginTop: '6px', lineHeight: 1.4 }}>
              TAIRS score<br />out of 100
            </div>
          </div>
        </div>

        {/* TAIRS explanation strip */}
        <div style={{ display: 'flex', gap: '4px', marginTop: '16px', marginBottom: '20px', borderRadius: '10px', overflow: 'hidden' }}>
          {[
            { label: 'AI-Unaware', range: '0–14',   color: '#FF6B6B' },
            { label: 'AI-Curious',  range: '15–34',  color: '#FF9F43' },
            { label: 'AI-Aware',    range: '35–54',  color: '#F4ED3C' },
            { label: 'AI-Ready',    range: '55–74',  color: '#A8E6CF' },
            { label: 'AI-Forward',  range: '75–100', color: '#C0F43C' },
          ].map(t => (
            <div key={t.label} style={{ flex: 1, padding: '9px 8px', background: tier === t.label ? `${t.color}20` : '#EEF9F9', border: `1px solid ${tier === t.label ? t.color + '50' : '#E6EFF0'}`, borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: t.color, letterSpacing: '0.3px' }}>{t.label}</div>
              <div style={{ fontSize: '13px', color: '#464D53', marginTop: '3px' }}>{t.range}</div>
            </div>
          ))}
        </div>

        {/* ── Stats strip / Journey kickstart ── */}
        {completedCount === 0 ? (
          /* Zero state — no courses completed yet */
          <div style={{ marginBottom: '24px' }}>
            <div style={{ background: 'linear-gradient(135deg, rgba(0,165,163,0.08) 0%, rgba(164,120,255,0.06) 100%)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '18px', padding: '24px 28px', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', color: '#00A5A3', textTransform: 'uppercase', marginBottom: '10px' }}>Your AI learning journey begins here</div>
              <p style={{ fontSize: '16px', color: '#464D53', lineHeight: 1.65, margin: '0 0 20px' }}>
                You have been placed on the <strong style={{ color: '#1E2124' }}>{TRACK_LABEL[track]}</strong> based on your AI readiness score. Start your first course below — every course you complete moves your score forward and builds real skills you can use tomorrow.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {[
                  { step: '01', label: 'Start a course', sub: 'Pick any course and begin', done: false, color: '#00A5A3' },
                  { step: '02', label: 'Pass the assessment', sub: '60% or higher to complete', done: false, color: '#A478FF' },
                  { step: '03', label: 'Watch your score climb', sub: 'TAIRS updates as you learn', done: false, color: '#C0F43C' },
                ].map(item => (
                  <div key={item.step} style={{ background: '#EEF9F9', border: `1px solid ${item.color}25`, borderRadius: '12px', padding: '14px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 900, color: item.color, letterSpacing: '1.5px', marginBottom: '6px' }}>STEP {item.step}</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#1E2124', marginBottom: '4px' }}>{item.label}</div>
                    <div style={{ fontSize: '14px', color: '#64748B' }}>{item.sub}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              <div style={{ background: '#FFFFFF', border: '1px solid #E6EFF0', borderRadius: '12px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
                <svg width="16" height="16" fill="none" stroke="rgba(70,77,83,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                <div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: '#1E2124' }}>{courses.length}</div>
                  <div style={{ fontSize: '13px', color: '#64748B' }}>courses available</div>
                </div>
              </div>
              <div style={{ background: 'rgba(255,159,67,0.05)', border: '1px solid rgba(255,159,67,0.15)', borderRadius: '12px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg width="16" height="16" fill="none" stroke="#FF9F43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: '#FF9F43' }}>{totalMandatory}</div>
                  <div style={{ fontSize: '13px', color: '#64748B' }}>mandatory courses</div>
                </div>
              </div>
              <div style={{ background: `${tierConfig.bg}`, border: `1px solid ${tierConfig.border}`, borderRadius: '12px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg width="16" height="16" fill="none" stroke={tierConfig.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: tierConfig.color }}>{track.charAt(0).toUpperCase() + track.slice(1)}</div>
                  <div style={{ fontSize: '13px', color: '#64748B' }}>your starting track</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Progress state — real stats */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {/* Completed — clickable, scrolls to section */}
            <button
              onClick={() => document.getElementById('completed-section')?.scrollIntoView({ behavior: 'smooth' })}
              style={{ background: 'rgba(192,244,60,0.05)', border: '1px solid rgba(192,244,60,0.2)', borderRadius: '14px', padding: '18px 20px', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#C0F43C', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '6px' }}>Courses Completed</div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#1E2124', marginBottom: '4px' }}>{completedCount}</div>
              <div style={{ fontSize: '15px', color: '#C0F43C', display: 'flex', alignItems: 'center', gap: '4px' }}>
                View completed
                <svg width="11" height="11" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </button>
            {/* Mandatory */}
            <div style={{ background: completedMandatory >= totalMandatory ? 'rgba(192,244,60,0.05)' : '#FFFFFF', border: `1px solid ${completedMandatory >= totalMandatory ? 'rgba(192,244,60,0.2)' : 'rgba(15,23,42,0.08)'}`, borderRadius: '14px', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: completedMandatory >= totalMandatory ? '#C0F43C' : '#464D53', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '6px' }}>Mandatory Progress</div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#1E2124', marginBottom: '4px' }}>{completedMandatory}<span style={{ fontSize: '17px', color: '#64748B', fontWeight: 700 }}>/{totalMandatory}</span></div>
              <div style={{ fontSize: '15px', color: '#464D53' }}>
                {completedMandatory >= totalMandatory ? 'All mandatory done' : `${totalMandatory - completedMandatory} remaining`}
              </div>
            </div>
            {/* Track */}
            <div style={{ background: tierConfig.bg, border: `1px solid ${tierConfig.border}`, borderRadius: '14px', padding: '18px 20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: tierConfig.color, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '6px' }}>Current Track</div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#1E2124', marginBottom: '4px' }}>{track.charAt(0).toUpperCase() + track.slice(1)}</div>
              <div style={{ fontSize: '15px', color: '#464D53' }}>learning level</div>
            </div>
          </div>
        )}

        {/* ── Two column: Next Up + Tip ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '16px', marginBottom: '24px' }}>

          {/* Next Up */}
          {nextCourse ? (
            <div style={{ background: '#FFFFFF', border: `1px solid ${tierConfig.border}`, borderRadius: '18px', padding: '28px', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: tierConfig.color, textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Next Up
                {'rec_label' in nextCourse && 'rec_reason' in nextCourse && nextCourse.rec_label !== 'ai' && !!nextCourse.rec_reason && (
                  <span style={{ fontSize: '10px', fontWeight: 700, color: REC_LABEL_COLOR[nextCourse.rec_label as string] ?? tierConfig.color, background: `${REC_LABEL_COLOR[nextCourse.rec_label as string] ?? tierConfig.color}18`, padding: '2px 8px', borderRadius: '6px', letterSpacing: '0.5px', textTransform: 'none' }}>
                    {nextCourse.rec_reason as string}
                  </span>
                )}
                {'rec_label' in nextCourse && nextCourse.rec_label === 'ai' && (
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#A478FF', background: 'rgba(164,120,255,0.12)', border: '1px solid rgba(164,120,255,0.25)', padding: '2px 8px', borderRadius: '6px', letterSpacing: '0.5px', textTransform: 'none' }}>
                    AI-picked
                  </span>
                )}
              </div>
              {'rec_label' in nextCourse && 'rec_reason' in nextCourse && nextCourse.rec_label === 'ai' && !!nextCourse.rec_reason && (
                <div style={{ fontSize: '14px', color: 'rgba(164,120,255,0.9)', lineHeight: 1.65, marginBottom: '12px', fontStyle: 'italic' }}>
                  {nextCourse.rec_reason as string}
                </div>
              )}
              <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1E2124', margin: '0 0 6px', lineHeight: 1.25 }}>
                {nextCourse.title}
              </h2>
              <p style={{ fontSize: '15px', color: '#464D53', margin: '0 0 8px', lineHeight: 1.65 }}>
                {nextCourse.subtitle}
              </p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#464D53', background: '#EEF9F9', padding: '3px 10px', borderRadius: '20px' }}>
                  {nextCourse.estimated_minutes} min
                </span>
                {nextCourse.is_mandatory && (
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#FF9F43', background: '#FF9F4315', padding: '3px 10px', borderRadius: '20px' }}>
                    Mandatory
                  </span>
                )}
                {nextCourse.tool_name && (
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#464D53', background: '#EEF9F9', padding: '3px 10px', borderRadius: '20px' }}>
                    {nextCourse.tool_name}
                  </span>
                )}
              </div>
              <Link
                href={`/dashboard/course/${nextCourse.id}?staff_id=${staffId}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '14px 26px', background: tierConfig.color, color: score >= 55 ? 'white' : '#1E2124', borderRadius: '12px', textDecoration: 'none', fontWeight: 800, fontSize: '16px' }}
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
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#C0F43C', marginBottom: '6px' }}>Track Complete!</div>
                <p style={{ fontSize: '15px', color: '#464D53', margin: 0, lineHeight: 1.65 }}>
                  You've completed all {track} track courses. Explore the full library for more.
                </p>
                <Link href={`/dashboard/library?id=${staffId}`} style={{ display: 'inline-block', marginTop: '14px', fontSize: '15px', fontWeight: 700, color: '#C0F43C', textDecoration: 'underline' }}>
                  Browse Library
                </Link>
              </div>
            </div>
          )}

          {/* Daily tip */}
          <div style={{ background: 'rgba(0,165,163,0.07)', border: '1px solid rgba(0,165,163,0.18)', borderRadius: '18px', padding: '24px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: '#00A5A3', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="12" height="12" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              Daily Tip
            </div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#1E2124', marginBottom: '10px', lineHeight: 1.3 }}>
              {tip.title}
            </div>
            <p style={{ fontSize: '15px', color: '#464D53', margin: 0, lineHeight: 1.65 }}>
              {tip.body}
            </p>
          </div>
        </div>

        {/* ── Recommended For You ── */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#1E2124', margin: 0 }}>Recommended For You</h2>
                {aiRecsLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '12px', height: '12px', border: '2px solid rgba(164,120,255,0.3)', borderTopColor: '#A478FF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#A478FF', letterSpacing: '0.5px' }}>AI thinking…</span>
                  </div>
                )}
                {aiRecsReady && !aiRecsLoading && (
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#A478FF', background: 'rgba(164,120,255,0.12)', border: '1px solid rgba(164,120,255,0.25)', padding: '2px 8px', borderRadius: '20px', letterSpacing: '0.5px' }}>
                    AI-personalised
                  </span>
                )}
              </div>
              <div style={{ fontSize: '14px', color: '#464D53', marginTop: '2px' }}>
                {aiRecsReady ? 'Chosen by AI based on your role, tasks, and learning profile' : 'Ranked by your role, department, and learning track'}
              </div>
            </div>
            <Link href={`/dashboard/library?id=${staffId}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 700, color: '#00A5A3', background: 'rgba(0,165,163,0.12)', border: '1px solid rgba(0,165,163,0.3)', padding: '6px 14px', borderRadius: '20px', textDecoration: 'none' }}>
              Browse All
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(recList.length > 0 ? recList.filter(c => !dismissedIds.has(c.id)) : courses.filter(c => !dismissedIds.has(c.id)).slice(0, 5)).map((course, idx) => {
              const done    = completedIds.has(course.id)
              const recLabel = 'rec_label' in course ? course.rec_label as string : null
              const recReason = 'rec_reason' in course ? course.rec_reason as string : null
              const labelColor = recLabel ? (REC_LABEL_COLOR[recLabel] ?? tierConfig.color) : tierConfig.color
              const isNext  = !done && idx === 0 && recList.length > 0
              return (
                <div key={course.id} style={{ position: 'relative' }}>
                <Link
                  href={`/dashboard/course/${course.id}?staff_id=${staffId}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '36px 1fr auto',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '16px 20px',
                    background: isNext ? `${tierConfig.bg}` : '#FFFFFF',
                    border: `1px solid ${isNext ? tierConfig.border : '#E6EFF0'}`,
                    boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)',
                    borderRadius: '14px',
                    textDecoration: 'none',
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  {/* Step number / checkmark */}
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: done ? '#C0F43C20' : isNext ? `${tierConfig.color}20` : '#F1F5F9', border: `2px solid ${done ? '#C0F43C' : isNext ? tierConfig.color : 'rgba(15,23,42,0.12)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {done
                      ? <svg width="14" height="14" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      : <span style={{ fontSize: '13px', fontWeight: 800, color: isNext ? tierConfig.color : '#475569' }}>{idx + 1}</span>
                    }
                  </div>
                  {/* Title + reason */}
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: done ? '#64748B' : '#1E2124', marginBottom: '4px' }}>{course.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: recReason && !done && recLabel === 'ai' ? '5px' : '0' }}>
                      <span style={{ fontSize: '13px', color: '#464D53' }}>{course.estimated_minutes} min</span>
                      {course.is_mandatory && (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#FF9F43', background: '#FF9F4312', padding: '1px 7px', borderRadius: '5px' }}>Mandatory</span>
                      )}
                      {recReason && !done && recLabel !== 'ai' && (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: labelColor, background: `${labelColor}15`, padding: '1px 7px', borderRadius: '5px' }}>
                          {recReason}
                        </span>
                      )}
                    </div>
                    {recReason && !done && recLabel === 'ai' && (
                      <div style={{ fontSize: '13px', color: 'rgba(164,120,255,0.85)', lineHeight: 1.65, fontStyle: 'italic' }}>
                        {recReason}
                      </div>
                    )}
                  </div>
                  {/* Status */}
                  <div style={{ fontSize: '13px', fontWeight: 700, color: done ? '#C0F43C' : isNext ? tierConfig.color : '#64748B', textAlign: 'right', flexShrink: 0 }}>
                    {done ? 'Done' : isNext ? 'Start' : 'View'}
                  </div>
                </Link>
                {!done && (
                  <button
                    onClick={e => { e.preventDefault(); dismissCourse(course.id) }}
                    title="Not for me"
                    style={{ position: 'absolute', top: '8px', right: '8px', width: '20px', height: '20px', borderRadius: '50%', border: 'none', background: '#EEF9F9', color: '#64748B', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}
                  >
                    <svg width="8" height="8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Course Library CTA ── */}
        <Link
          href={`/dashboard/library?id=${staffId}`}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '16px', textDecoration: 'none', marginBottom: '24px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '11px', background: 'rgba(0,165,163,0.15)', border: '1px solid rgba(0,165,163,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E2124', marginBottom: '2px' }}>Course Library</div>
              <div style={{ fontSize: '14px', color: '#464D53' }}>{courses.length} courses across Foundation, Adoption &amp; Advanced tracks</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 700, color: '#00A5A3', flexShrink: 0 }}>
            Browse Library
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </Link>

        {/* ── What improves your score ── */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E6EFF0', borderRadius: '18px', padding: '24px 28px', marginBottom: '24px', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1E2124', margin: '0 0 16px' }}>How to move up from {tier}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {getImprovementTips(tier).map((tip, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: tierConfig.color, marginTop: '5px', flexShrink: 0 }} />
                <span style={{ fontSize: '15px', color: '#464D53', lineHeight: 1.65 }}>{tip}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Completed Courses ── */}
        {completedCount > 0 && (() => {
          const TRACK_COLORS: Record<string, { color: string; bg: string; label: string }> = {
            foundation: { color: '#FF9F43', bg: 'rgba(255,159,67,0.12)', label: 'Foundation' },
            adoption:   { color: '#00A5A3', bg: 'rgba(0,165,163,0.12)',  label: 'Adoption'   },
            advanced:   { color: '#C0F43C', bg: 'rgba(192,244,60,0.12)', label: 'Advanced'   },
          }
          const done = completions.filter(c => c.passed).map(c => ({ ...c, course: courses.find(cr => cr.id === c.course_id) })).filter(c => c.course)
          return (
            <div id="completed-section" style={{ background: 'rgba(192,244,60,0.03)', border: '1px solid rgba(192,244,60,0.15)', borderRadius: '18px', padding: '24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1E2124', margin: '0 0 4px' }}>Completed Courses</h3>
                  <div style={{ fontSize: '15px', color: '#464D53' }}>{completedCount} course{completedCount !== 1 ? 's' : ''} passed</div>
                </div>
                <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(192,244,60,0.12)', border: '2px solid rgba(192,244,60,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {done.map(({ course_id, test_score, course }) => {
                  const tc = TRACK_COLORS[course!.tier_level] ?? TRACK_COLORS.foundation
                  return (
                    <div key={course_id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', alignItems: 'center', gap: '14px', padding: '14px 18px', background: 'rgba(192,244,60,0.04)', border: '1px solid rgba(192,244,60,0.1)', borderRadius: '12px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(192,244,60,0.12)', border: '1.5px solid rgba(192,244,60,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="13" height="13" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1E2124', marginBottom: '5px' }}>{course!.title}</div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: tc.color, background: tc.bg, padding: '2px 9px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tc.label}</span>
                          {test_score !== null && (
                            <span style={{ fontSize: '14px', color: '#464D53', fontWeight: 600 }}>Score: {test_score}%</span>
                          )}
                        </div>
                      </div>
                      <Link href={`/dashboard/course/${course!.id}?staff_id=${staffId}`} style={{ fontSize: '14px', fontWeight: 700, color: '#C0F43C', textDecoration: 'none', background: 'rgba(192,244,60,0.1)', border: '1px solid rgba(192,244,60,0.25)', padding: '7px 16px', borderRadius: '20px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        Review
                      </Link>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

      </div>

      {/* ── My Events section ── */}
      {events.length > 0 && (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px 32px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', color: '#00A5A3', textTransform: 'uppercase', marginBottom: '14px' }}>My Events</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {events.map(ev => (
              <div key={ev.id} style={{ background: 'rgba(0,165,163,0.05)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#1E2124' }}>{ev.name}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: ev.status === 'active' ? 'rgba(192,244,60,0.15)' : '#EEF9F9', color: ev.status === 'active' ? '#C0F43C' : '#464D53' }}>{ev.status}</span>
                  </div>
                  <div style={{ fontSize: '14px', color: '#64748B', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                    {ev.city && <span>{ev.city}</span>}
                    {ev.event_date && <span>{new Date(ev.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                    {ev.my_role && <span style={{ color: '#00A5A3', fontWeight: 600 }}>{ev.my_role}</span>}
                  </div>
                </div>
                <button
                  onClick={() => {
                    const chat = document.querySelector('[data-tresci-trigger]') as HTMLElement
                    if (chat) chat.click()
                  }}
                  style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid rgba(0,165,163,0.4)', background: 'rgba(0,165,163,0.1)', color: '#00A5A3', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  Talk to Tresci about this event
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── My Event Tasks section ── */}
      {myChecklist.length > 0 && (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', color: '#F59E0B', textTransform: 'uppercase' }}>My Event Tasks</div>
            <span style={{ fontSize: '13px', color: '#64748B' }}>
              {myChecklist.filter(i => i.status === 'done').length}/{myChecklist.length} done
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {myChecklist.map(item => {
              const isLate = item.due_date && new Date(item.due_date) < new Date() && item.status !== 'done'
              const statusColors: Record<string, { color: string; bg: string }> = {
                not_started: { color: '#64748B', bg: '#F1F5F9' },
                in_progress: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
                done:        { color: '#C0F43C', bg: 'rgba(192,244,60,0.1)' },
                overdue:     { color: '#FF6B6B', bg: 'rgba(255,107,107,0.1)' },
              }
              const sc = statusColors[item.status] ?? statusColors.not_started

              return (
                <div key={item.id} style={{ background: '#FFFFFF', border: `1px solid ${isLate ? 'rgba(255,107,107,0.2)' : '#E6EFF0'}`, borderRadius: '12px', padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    {/* Status toggle */}
                    <button
                      onClick={async () => {
                        const next = item.status === 'not_started' ? 'in_progress' : item.status === 'in_progress' ? 'done' : 'not_started'
                        setChecklistSaving(p => ({ ...p, [item.id]: true }))
                        await fetch(`/api/events/my-checklist?id=${item.id}`, {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: next }),
                        })
                        setMyChecklist(prev => prev.map(i => i.id === item.id ? { ...i, status: next } : i))
                        setChecklistSaving(p => ({ ...p, [item.id]: false }))
                      }}
                      style={{ width: '20px', height: '20px', borderRadius: '5px', border: `2px solid ${item.status === 'done' ? '#C0F43C' : 'rgba(15,23,42,0.16)'}`, background: item.status === 'done' ? '#C0F43C' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px', transition: 'all 0.15s' }}>
                      {item.status === 'done' && <svg width="10" height="10" fill="none" stroke="#1E2124" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                      {item.status === 'in_progress' && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#F59E0B' }} />}
                    </button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <span style={{ fontSize: '15px', fontWeight: 600, color: item.status === 'done' ? '#64748B' : '#1E2124', textDecoration: item.status === 'done' ? 'line-through' : 'none' }}>
                          {item.title}
                        </span>
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                          {item.status.replace('_', ' ')}
                        </span>
                        {isLate && <span style={{ fontSize: '10px', fontWeight: 700, color: '#FF6B6B' }}>Overdue</span>}
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748B', display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        {item.events?.name && <span>{item.events.name}</span>}
                        <span style={{ color: '#94A3B8' }}>{item.department}</span>
                        {item.due_date && <span style={{ color: isLate ? '#FF6B6B' : '#64748B' }}>
                          Due {new Date(item.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>}
                      </div>
                      {/* Notes input */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                        <textarea
                          value={checklistNotes[item.id] ?? ''}
                          onChange={e => setChecklistNotes(p => ({ ...p, [item.id]: e.target.value }))}
                          placeholder="Add your update or notes…"
                          rows={2}
                          style={{ flex: 1, padding: '7px 10px', borderRadius: '8px', border: '1px solid #E6EFF0', background: '#FFFFFF', color: '#1E2124', fontSize: '14px', fontFamily: 'inherit', resize: 'none' }}
                        />
                        <button
                          disabled={checklistSaving[item.id]}
                          onClick={async () => {
                            setChecklistSaving(p => ({ ...p, [item.id]: true }))
                            await fetch(`/api/events/my-checklist?id=${item.id}`, {
                              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ notes: checklistNotes[item.id] ?? '' }),
                            })
                            setMyChecklist(prev => prev.map(i => i.id === item.id ? { ...i, notes: checklistNotes[item.id] ?? '' } : i))
                            setChecklistSaving(p => ({ ...p, [item.id]: false }))
                          }}
                          style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#F59E0B', color: '#1E2124', fontSize: '11px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                          {checklistSaving[item.id] ? '…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Knowledge Base section ── */}
      {docs.length > 0 && (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px 48px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', color: '#C0F43C', textTransform: 'uppercase', marginBottom: '14px' }}>Knowledge Base</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
            {docs.map(doc => {
              const typeColor: Record<string,string> = { policy: '#FF9F43', event_brief: '#00A5A3', staff_doc: '#C0F43C', onboarding: '#A478FF', other: 'rgba(255,255,255,0.4)' }
              const tc = typeColor[doc.type] ?? 'rgba(255,255,255,0.4)'
              return (
                <div key={doc.id} style={{ background: '#FFFFFF', border: '1px solid #E6EFF0', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${tc}15`, border: `1px solid ${tc}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" fill="none" stroke={tc} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: tc, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{doc.type.replace('_', ' ')}</span>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#1E2124', marginBottom: '4px', lineHeight: 1.4 }}>{doc.title}</div>
                  <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '12px' }}>{doc.word_count?.toLocaleString()} words</div>
                  <Link href="/chat" style={{ fontSize: '14px', fontWeight: 700, color: tc, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Talk to Tresci about this
                    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Floating Talk to Tresci button ── */}
      <Link
        href={`/chat`}
        style={{ position: 'fixed', bottom: '28px', right: '28px', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 20px', background: '#00A5A3', borderRadius: '50px', textDecoration: 'none', boxShadow: '0 8px 32px rgba(0,165,163,0.35)', zIndex: 100 }}
      >
        <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        <span style={{ fontSize: '15px', fontWeight: 800, color: 'white', letterSpacing: '0.1px' }}>Talk to Tresci</span>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C0F43C', animation: 'pulse 2s infinite' }} />
      </Link>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes demoGlow { 0%{color:#FF9F43} 20%{color:#FF6B6B} 40%{color:#C0F43C} 60%{color:#00A5A3} 80%{color:#FF9F43} 100%{color:#FFD08A} }
      `}</style>

      {/* ── Feedback Card ── */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 32px 48px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E6EFF0', borderRadius: '18px', padding: '28px', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#A478FF', marginBottom: '8px' }}>Shape This Platform</div>
          <h3 style={{ fontSize: '22px', fontWeight: 900, color: '#1E2124', margin: '0 0 6px' }}>What should we build next?</h3>
          <p style={{ fontSize: '15px', color: '#64748B', margin: '0 0 18px', lineHeight: 1.65 }}>
            Trescademy is being built for you. If there is a feature, a course, a report, or anything else you would like to see — tell us here. Every suggestion is reviewed by the team.
          </p>
          {feedbackSent ? (
            <div style={{ padding: '16px', background: 'rgba(192,244,60,0.08)', border: '1px solid rgba(192,244,60,0.2)', borderRadius: '12px', fontSize: '16px', color: '#C0F43C', fontWeight: 700 }}>
              Thank you. Your feedback has been received and will be reviewed by the team.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <textarea
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder="e.g. I would like to see a leaderboard for our department, or a mobile app, or a course on AI for client presentations..."
                rows={4}
                style={{ width: '100%', padding: '14px 16px', background: '#FFFFFF', border: '1px solid #E6EFF0', borderRadius: '12px', color: '#1E2124', fontSize: '16px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.65 }}
              />
              <button
                disabled={!feedbackText.trim() || feedbackSending}
                onClick={async () => {
                  setFeedbackSending(true)
                  await fetch('/api/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ staff_id: staffId, name: staff?.name, department: staff?.department, message: feedbackText }),
                  })
                  setFeedbackSending(false)
                  setFeedbackSent(true)
                }}
                style={{ alignSelf: 'flex-start', padding: '12px 24px', background: '#A478FF', border: 'none', borderRadius: '10px', color: 'white', fontSize: '15px', fontWeight: 800, cursor: !feedbackText.trim() || feedbackSending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: !feedbackText.trim() || feedbackSending ? 0.5 : 1 }}>
                {feedbackSending ? 'Sending...' : 'Send Feedback'}
              </button>
            </div>
          )}
        </div>
      </div>
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
      <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(15,23,42,0.1)" strokeWidth="8" />
      <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 55 55)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
      <text x="55" y="52" textAnchor="middle" fill="#1E2124" fontSize="30" fontWeight="900" fontFamily="Manrope,sans-serif">{score}</text>
      <text x="55" y="68" textAnchor="middle" fill="#464D53" fontSize="14" fontFamily="Manrope,sans-serif">/ 100</text>
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
      'Contribute a custom course to the Trescademy library',
    ],
  }
  return tips[tier] ?? tips['AI-Curious']
}

/* ── Styles ── */
const S = {
  page: {
    fontFamily: 'var(--font-manrope), Manrope, sans-serif',
    background: '#F6FFFE',
    minHeight:  '100vh',
    color:      '#1E2124',
  },
  nav: {
    background:   '#FFFFFF',
    borderBottom: '1px solid #E6EFF0',
    padding:      '0 32px',
    height:       '64px',
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'space-between',
    boxShadow:    '0 1px 3px rgba(0,165,163,0.08)',
  },
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  )
}
