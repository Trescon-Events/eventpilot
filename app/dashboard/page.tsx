'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { computeAIRS, breakdownAIRS, getTier, getTrack, TIER_COLORS, DEPT_USE_CASES } from '@/app/lib/airs'
import PlatformMenu from '@/app/components/PlatformMenu'
import NavBar, { ProfileMenu, NotificationBell, MOD_EVENTPILOT } from '@/app/components/NavBar'

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
  toolkit_access?: boolean
  tool_grants?: Record<string, boolean>
  profile_complete?: boolean
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
  courses?: { tier_level: string } | null
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
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#E8EEF4', minHeight: '100vh', color: '#0F1923', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', background: '#00897B', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#00695C', marginBottom: '8px' }}>Event Pilot</div>
        <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#0F1923', margin: '0 0 10px' }}>My Learning Dashboard</h1>
        <p style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.65, margin: '0 0 28px' }}>Enter your work email to access your dashboard.</p>
        <form onSubmit={handleEmail} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@tresconglobal.com"
            style={{ flex: 1, padding: '11px 16px', borderRadius: '10px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{ padding: '11px 20px', borderRadius: '10px', background: '#00897B', color: 'white', fontSize: '13px', fontWeight: 700, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: loading ? 0.7 : 1 }}>
            {loading ? '...' : 'Go'}
          </button>
        </form>
        {error && <p style={{ marginTop: '12px', fontSize: '13px', color: '#FF6B6B' }}>{error}</p>}
        <div style={{ marginTop: '24px', padding: '14px 18px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', fontSize: '13px', color: '#0F1923', lineHeight: 1.65 }}>
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
  const [notifications,  setNotifications]  = useState<{ id: string; title: string; body: string; course_id: string | null; review_id: string | null }[]>([])
  type MyReviewComment = { id: string; author_type: string; author_name: string; message: string | null; is_status_change: boolean; new_status: string | null; created_at: string }
  type MyReview = { id: string; tool: string; review_type: string; severity: string; title: string; status: string; created_at: string; comments: MyReviewComment[] }
  const [myReviews, setMyReviews] = useState<MyReview[]>([])
  const [aiRecsLoading,  setAiRecsLoading]  = useState(false)
  const [aiRecsReady,    setAiRecsReady]    = useState(false)
  const [isDemo,         setIsDemo]         = useState(false)
  // Team courses (managers only)
  type TeamMember = { id: string; name: string; department: string; role: string; job_level: string; courses_done: number; total_courses: number; mandatory_done: number; mandatory_total: number; last_activity: string | null }
  const [teamCourses,    setTeamCourses]    = useState<TeamMember[]>([])
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
  // Change password
  const [showChangePw,  setShowChangePw]  = useState(false)
  const [cpCurrent,     setCpCurrent]     = useState('')
  const [cpNew,         setCpNew]         = useState('')
  const [cpConfirm,     setCpConfirm]     = useState('')
  const [cpLoading,     setCpLoading]     = useState(false)
  const [cpError,       setCpError]       = useState('')
  const [cpDone,        setCpDone]        = useState(false)
  const [showCpC,       setShowCpC]       = useState(false)
  const [showCpN,       setShowCpN]       = useState(false)
  const isAdmin = typeof window !== 'undefined' && sessionStorage.getItem('tai_admin_authed') === '1'

  const tip = DAILY_TIPS[new Date().getDate() % DAILY_TIPS.length]

  // useMemo must be declared here — before any conditional early returns — to satisfy React Rules of Hooks
  const completedIds   = useMemo(() => new Set(completions.filter(c => c.passed).map(c => c.course_id)), [completions])
  const completedCount = useMemo(() => completions.filter(c => c.passed).length, [completions])

  useEffect(() => {
    if (!staffId) { setError('No staff ID provided. Please access this page via your dashboard link.'); setLoading(false); return }
    const stored = localStorage.getItem(`pilot_dismissed_${staffId}`)
    if (stored) setDismissedIds(new Set(JSON.parse(stored)))
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId])

  function dismissCourse(courseId: string) {
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.add(courseId)
      localStorage.setItem(`pilot_dismissed_${staffId}`, JSON.stringify([...next]))
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

      setStaff(data.staff)
      setTasks(data.tasks ?? [])
      setCourses(Array.isArray(data.courses) ? data.courses : [])
      setCompletions(Array.isArray(data.completions) ? data.completions : [])
      setRecPrimary(data.recommendations?.primary ?? null)
      setRecList(data.recommendations?.list ?? [])
      setRecContext(data.recommendations?.context ?? null)
      setNotifications(data.notifications ?? [])
      setLoading(false)
      /* Load my submitted reviews with trail */
      fetch('/api/reviews?my=1').then(r => r.ok ? r.json() : []).then(d => setMyReviews(Array.isArray(d) ? d : [])).catch(() => {})
      /* Fire AI recommendations async — cached for 30 min so Gemini isn't hit on every page load */
      loadAiRecs()
      /* Load team course progress for managers */
      if (data.staff?.has_reports && staffId) {
        fetch(`/api/team-courses?manager_id=${staffId}`)
          .then(r => r.ok ? r.json() : [])
          .then(d => setTeamCourses(Array.isArray(d) ? d : []))
          .catch(() => {})
      }
    } catch {
      setError('Failed to load dashboard data.')
      setLoading(false)
    }
  }

  async function loadAiRecs() {
    if (!staffId || staffId === 'super-admin') return

    // Check localStorage cache — skip Gemini call if fresh (< 30 min old)
    const CACHE_KEY = `pilot_recs_${staffId}`
    const CACHE_TTL = 30 * 60 * 1000 // 30 minutes
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const { ts, recs } = JSON.parse(cached)
        if (Date.now() - ts < CACHE_TTL && Array.isArray(recs) && recs.length > 0) {
          setRecPrimary(recs[0])
          setRecList(recs.slice(1))
          setAiRecsReady(true)
          return // skip Gemini — use cached
        }
      }
    } catch { /* ignore bad cache */ }

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
        // Cache for 30 minutes
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), recs })) } catch { /* ignore */ }
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
          <div style={{ width: '40px', height: '40px', border: '3px solid #DDE8EE', borderTopColor: '#00897B', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: '#2D3E50', fontSize: '13px' }}>Loading your dashboard…</div>
        </div>
      </div>
    )
  }

  if (error || !staff) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '0 24px' }}>
          <div style={{ fontSize: '13px', color: '#FF6B6B', marginBottom: '12px' }}>Error</div>
          <p style={{ color: '#2D3E50', fontSize: '13px' }}>{error || 'Something went wrong.'}</p>
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

  const score      = computeAIRS(tasks, completions)
  const scoreBreakdown = breakdownAIRS(tasks, completions)
  const tier       = getTier(score)
  const track      = getTrack(score)
  const tierConfig = TIER_COLORS[tier]
  const TRACK_CONFIG_MAP = {
    foundation: { color: '#0E7490', border: '#0E749060' },
    adoption:   { color: '#7C3AED', border: '#7C3AED60' },
    advanced:   { color: '#166534', border: '#16653460' },
  }
  const trackConfig = TRACK_CONFIG_MAP[track]
  const firstName  = staff.name.split(' ')[0]

  const nextCourse      = recPrimary ?? courses.find(c => !completedIds.has(c.id)) ?? null
  const totalMandatory  = recContext?.mandatory_total  ?? courses.filter(c => c.is_mandatory).length
  const completedMandatory = recContext?.mandatory_completed ?? courses.filter(c => c.is_mandatory && completedIds.has(c.id)).length

  const REC_LABEL_COLOR: Record<string, string> = {
    mandatory:       '#8B1A1A',
    dept:            '#00897B',
    track:           trackConfig.color,
    foundation_gap:  '#F4ED3C',
    role:            '#A478FF',
  }

  return (
    <div style={S.page}>
      {/* ── Nav ── */}
      <NavBar
        module={MOD_EVENTPILOT}
        subtitle={isAdmin ? 'Personal View' : 'My Dashboard'}
        homeHref={staffId ? `/dashboard?id=${staffId}` : '/dashboard'}
        rightSlot={<>
          {(staff.has_reports || isAdmin) && (
            <Link className="tbtn tbtn-purple" href={`/team?manager_id=${staffId}&staff_id=${staffId}`}>
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Team Dashboard
            </Link>
          )}
          {isAdmin && (
            <Link className="tbtn tbtn-teal" href="/admin">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              Admin Dashboard
            </Link>
          )}
          {isAdmin && (
            <Link className="tbtn tbtn-purple" href="/hr">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              HR Portal
            </Link>
          )}
          <PlatformMenu staffId={staffId} />
          <NotificationBell staffId={staffId} />
          <ProfileMenu name={staff.name} roles={staff.has_reports ? undefined : undefined} />
        </>}
      />

      {/* ── Demo mode banner — auto-hides once real staff data is imported ── */}
      {isDemo && (
        <div style={{ background: 'rgba(139,26,26,0.08)', borderBottom: '1px solid rgba(139,26,26,0.25)', padding: '10px 32px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="14" height="14" fill="none" stroke="#8B1A1A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#8B1A1A', animation: 'demoGlow 3s linear infinite' }}>Demo Mode</span>
          <span style={{ fontSize: '13px', color: '#2D3E50' }}>The data shown on this dashboard is sample data for demonstration purposes only. It does not represent any real individual or organisation.</span>
        </div>
      )}

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* ── Notification banners ── */}
        {notifications.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
            {notifications.map(n => (
              <div key={n.id} style={{ background: 'linear-gradient(135deg, rgba(192,244,60,0.08) 0%, rgba(0,165,163,0.06) 100%)', border: '1px solid rgba(192,244,60,0.25)', borderRadius: '14px', padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #DDE8EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="16" height="16" fill="none" stroke="#007A6E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: n.review_id ? '#00697B' : '#3D6B00', marginBottom: '4px' }}>{n.title}</div>
                  <div style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.65 }}>{n.body}</div>
                  {n.course_id && (
                    <a href={`/dashboard/course/${n.course_id}${staffId ? `?staff_id=${staffId}` : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '10px', fontSize: '13px', fontWeight: 700, color: '#3D6B00', textDecoration: 'none' }}>
                      View Course
                      <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                    </a>
                  )}
                  {n.review_id && (
                    <a href="#my-submissions" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '10px', fontSize: '13px', fontWeight: 700, color: '#00697B', textDecoration: 'none' }}>
                      View your report
                      <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                    </a>
                  )}
                </div>
                <button
                  onClick={() => dismissNotification(n.id)}
                  style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#FFFFFF', border: '1px solid #DDE8EE', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  <svg width="11" height="11" fill="none" stroke="#0F1923" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Assessment prompt banner ── */}
        {!staff.profile_complete && (
          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1.5px solid rgba(245,158,11,0.35)', borderRadius: '16px', padding: '16px 22px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#92400E', marginBottom: '3px' }}>Your AI Readiness Score isn&apos;t set yet</div>
              <div style={{ fontSize: '13px', color: '#78350F', lineHeight: 1.5 }}>Complete the 5-minute assessment so the platform can match you to the right courses.</div>
            </div>
            <Link
              href={`/profile?id=${staffId}&name=${encodeURIComponent(staff.name)}&dept=${encodeURIComponent(staff.department ?? '')}&next=${encodeURIComponent(`/dashboard?id=${staffId}`)}`}
              style={{ background: '#D97706', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, padding: '10px 20px', borderRadius: '50px', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              Take Assessment
            </Link>
          </div>
        )}

        {/* ── Hero ── */}
        <div style={{ borderRadius: '20px', marginBottom: '24px', overflow: 'hidden', boxShadow: 'none' }}>
          {/* Rich colored header band */}
          <div style={{ background: `linear-gradient(135deg, ${tierConfig.color} 0%, ${tierConfig.color}CC 60%, #0F1923 100%)`, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'rgba(255,255,255,0.8)' }} />
              <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)' }}>
                {completedCount === 0 ? 'Welcome to Event Pilot' : 'Welcome back'} · {tier}
              </span>
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.5px' }}>
              {completedCount} course{completedCount !== 1 ? 's' : ''} completed
            </span>
          </div>
          {/* Body */}
          <div style={{ background: `linear-gradient(180deg, ${tierConfig.color}12 0%, #FFFFFF 55%)`, padding: '28px 32px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '24px', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '38px', fontWeight: 900, margin: '0 0 4px', letterSpacing: '-0.7px', color: '#0F1923', lineHeight: 1.1 }}>
                {staff.name}
              </h1>
              <div style={{ fontSize: '14px', color: '#5B7080', marginBottom: '22px', fontWeight: 500 }}>
                {staff.role} · {staff.department}
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'stretch' }}>
                <div style={{ background: tierConfig.color, borderRadius: '12px', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px', minWidth: '180px' }}>
                  <span style={{ fontSize: '40px', fontWeight: 900, color: '#FFFFFF', lineHeight: 1 }}>{score}</span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'rgba(255,255,255,0.9)', marginBottom: '2px' }}>{tier}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>AIRS · 0–100</div>
                  </div>
                </div>
                <div style={{ background: '#FFFFFF', border: `1.5px solid ${trackConfig.border}`, borderRadius: '12px', padding: '12px 20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: trackConfig.color, marginBottom: '2px' }}>{TRACK_LABEL[track]}</div>
                  <div style={{ fontSize: '12px', color: '#5B7080', fontWeight: 600 }}>Current learning track</div>
                </div>
                <Link
                  href={`/profile?id=${staffId}&name=${encodeURIComponent(staff.name)}&dept=${encodeURIComponent(staff.department ?? '')}&next=${encodeURIComponent(`/dashboard?id=${staffId}`)}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FFFFFF', border: '1.5px solid #B8CDD8', borderRadius: '12px', padding: '12px 18px', textDecoration: 'none', flexShrink: 0 }}
                >
                  <svg width="15" height="15" fill="none" stroke="#2D3E50" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '2px' }}>{staff.profile_complete ? 'Retake Assessment' : 'Take Assessment'}</div>
                    <div style={{ fontSize: '12px', color: '#5B7080', fontWeight: 600 }}>Update your AIRS profile</div>
                  </div>
                </Link>
              </div>
            </div>
            {/* Circular score ring */}
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <ScoreRing score={score} color={tierConfig.color} />
              <div style={{ fontSize: '12px', color: '#5B7080', marginTop: '6px', lineHeight: 1.4, fontWeight: 600 }}>
                AI Readiness Score<br />out of 100
              </div>
            </div>
          </div>
        </div>

        {/* ── My Workspace (role-personalised) ── */}
        {(() => {
          const grants        = staff.tool_grants ?? {}
          const hasTool       = (k: string) => isAdmin || grants[k] === true || (k === 'smart_data' && staff.toolkit_access)
          const dept          = staff.department ?? ''
          const level         = staff.job_level
          const isMgmt        = ['super_admin', 'office_head'].includes(level)
          const isTeamMgr     = ['dept_head', 'team_lead'].includes(level)
          const openTasks     = myChecklist.filter(i => i.status === 'open' || i.status === 'pending').length
          const upcomingEvts  = events.filter(e => e.status === 'upcoming' || e.status === 'live').length
          const mandatoryLeft = courses.filter(c => c.is_mandatory && !completedIds.has(c.id)).length

          type WSTile = { label: string; href: string; color: string }
          type WSStat = { value: string | number; label: string; color: string }

          let wsTitle    = 'My Workspace'
          let wsSub      = 'Your daily quick access'
          let wsColor    = '#00897B'
          let wsTiles: WSTile[]  = []
          let wsStats: WSStat[]  = []

          if (isMgmt) {
            wsTitle  = 'Leadership Workspace'
            wsSub    = 'Platform operations · full org access'
            wsColor  = '#0F1923'
            wsTiles  = [
              { label: 'Admin Panel',  href: '/admin',                                              color: '#0F1923' },
              { label: 'HR Portal',    href: '/hr',                                                 color: '#BE185D' },
              { label: 'Org Chart',    href: '/admin/org-chart',                                    color: '#7C3AED' },
              { label: 'Toolkit',      href: '/admin/toolkit',                                      color: '#00695C' },
            ]
            wsStats = [
              { value: upcomingEvts,  label: 'active events',        color: '#D97706' },
              { value: openTasks,     label: 'open tasks',           color: '#8B1A1A' },
              { value: mandatoryLeft, label: 'mandatory remaining',  color: '#0E7490' },
            ]
          } else if (isTeamMgr) {
            wsTitle  = 'Team Workspace'
            wsSub    = 'Your team & event management'
            wsColor  = '#7C3AED'
            wsTiles  = [
              { label: 'Team Dashboard', href: `/team?manager_id=${staffId}&staff_id=${staffId}`, color: '#8B5CF6' },
              { label: 'My Events',      href: `/dashboard?id=${staffId}#events`,                 color: '#D97706' },
              ...(hasTool('hr_portal') || dept === 'HR' ? [{ label: 'HR Portal', href: '/hr', color: '#BE185D' }] : []),
            ]
            wsStats = [
              { value: upcomingEvts,  label: 'events assigned',     color: '#D97706' },
              { value: openTasks,     label: 'open checklist tasks', color: '#8B1A1A' },
              { value: mandatoryLeft, label: 'mandatory pending',    color: '#0E7490' },
            ]
          } else if (dept.toLowerCase().includes('sales') || dept === 'Sales & Sponsorship') {
            wsTitle  = 'Sales Workspace'
            wsSub    = 'Lead intelligence & event sponsorship'
            wsColor  = '#0E7490'
            wsTiles  = [
              ...(hasTool('smart_data') ? [{ label: 'Smart Data', href: '/data/extract/file', color: '#00A5A3' }] : []),
              { label: 'My Events',  href: `/dashboard?id=${staffId}#events`, color: '#D97706' },
              { label: 'My HR',      href: '/my-hr',                          color: '#EC4899' },
            ]
            wsStats = [
              { value: upcomingEvts, label: 'events assigned',     color: '#D97706' },
              { value: openTasks,    label: 'open tasks',           color: '#8B1A1A' },
              { value: completedCount, label: 'courses done',       color: '#00897B' },
            ]
          } else if (dept === 'HR & Recruitment' || dept === 'HR') {
            wsTitle  = 'HR Workspace'
            wsSub    = 'People ops & self-service HR'
            wsColor  = '#BE185D'
            wsTiles  = [
              { label: 'HR Portal',   href: '/hr',    color: '#BE185D' },
              { label: 'My HR',       href: '/my-hr', color: '#EC4899' },
              { label: 'Attendance',  href: '/hr/attendance', color: '#7C3AED' },
            ]
            wsStats = [
              { value: upcomingEvts,  label: 'events assigned',    color: '#D97706' },
              { value: openTasks,     label: 'open tasks',          color: '#8B1A1A' },
              { value: mandatoryLeft, label: 'mandatory pending',   color: '#0E7490' },
            ]
          } else if (dept === 'Finance') {
            wsTitle  = 'Finance Workspace'
            wsSub    = 'P&L, payroll & expense management'
            wsColor  = '#1565C0'
            wsTiles  = [
              ...(hasTool('finance') ? [{ label: 'Finance', href: '/admin/toolkit', color: '#1565C0' }] : []),
              { label: 'My Events',  href: `/dashboard?id=${staffId}#events`, color: '#D97706' },
              { label: 'My HR',      href: '/my-hr',                          color: '#EC4899' },
            ]
            wsStats = [
              { value: upcomingEvts,  label: 'events assigned',    color: '#D97706' },
              { value: openTasks,     label: 'open tasks',          color: '#8B1A1A' },
              { value: mandatoryLeft, label: 'mandatory pending',   color: '#0E7490' },
            ]
          } else if (dept === 'Marketing' || dept === 'Content & Design') {
            wsTitle  = 'Creative Workspace'
            wsSub    = 'Content, brand & campaigns'
            wsColor  = '#DC2626'
            wsTiles  = [
              ...(hasTool('content') ? [{ label: 'Content Hub',    href: '/content',         color: '#0EA5E9' }] : []),
              ...(hasTool('brand_studio') ? [{ label: 'Brand Studio', href: '/admin/toolkit', color: '#DC2626' }] : []),
              { label: 'My Events',  href: `/dashboard?id=${staffId}#events`, color: '#D97706' },
              { label: 'My HR',      href: '/my-hr',                          color: '#EC4899' },
            ]
            wsStats = [
              { value: upcomingEvts,  label: 'events assigned',    color: '#D97706' },
              { value: openTasks,     label: 'open tasks',          color: '#8B1A1A' },
              { value: mandatoryLeft, label: 'mandatory pending',   color: '#0E7490' },
            ]
          } else {
            // Default: Events, Operations, Government Relations, IT, Other
            wsTitle  = dept ? `${dept} Workspace` : 'My Workspace'
            wsSub    = 'Your events, tasks & learning'
            wsColor  = '#00897B'
            wsTiles  = [
              { label: 'My Events',  href: `/dashboard?id=${staffId}#events`, color: '#D97706' },
              { label: 'My HR',      href: '/my-hr',                          color: '#EC4899' },
              ...(hasTool('smart_data') ? [{ label: 'Smart Data', href: '/data/extract/file', color: '#00A5A3' }] : []),
            ]
            wsStats = [
              { value: upcomingEvts,  label: 'events assigned',    color: '#D97706' },
              { value: openTasks,     label: 'open tasks',          color: '#8B1A1A' },
              { value: mandatoryLeft, label: 'mandatory pending',   color: '#0E7490' },
            ]
          }

          // Course-only rollout: override workspace for regular staff (no admin, no reports)
          if (!isAdmin && !isMgmt && !isTeamMgr && !staff.has_reports) {
            wsTitle = 'My Learning'
            wsSub   = 'Your AI readiness journey'
            wsColor = '#00897B'
            wsTiles = [
              { label: 'Course Library', href: `/dashboard/library?id=${staffId}`, color: '#3D6B00' },
              { label: 'My HR',          href: '/my-hr',                            color: '#EC4899' },
            ]
            wsStats = [
              { value: completedCount,         label: 'courses done',     color: '#00897B' },
              { value: mandatoryLeft,           label: 'mandatory left',   color: '#8B1A1A' },
              { value: totalMandatory,          label: 'total mandatory',  color: '#0E7490' },
            ]
          }

          return (
            <div style={{ background: `linear-gradient(135deg, ${wsColor}0D 0%, #FFFFFF 60%)`, border: `1.5px solid ${wsColor}20`, borderRadius: '16px', padding: '20px 24px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: wsColor, marginBottom: '3px' }}>{wsTitle}</div>
                  <div style={{ fontSize: '13px', color: '#5B7080', fontWeight: 500 }}>{wsSub}</div>
                </div>
                {/* Live stats */}
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {wsStats.map(s => (
                    <div key={s.label} style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '22px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                      <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Quick links */}
              {wsTiles.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {wsTiles.map(t => (
                    <Link key={t.label} href={t.href} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', background: '#FFFFFF', border: `1.5px solid ${t.color}30`, textDecoration: 'none', flexShrink: 0, transition: 'border-color 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = t.color }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = `${t.color}30` }}
                    >
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{t.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Your Platform Access ── */}
        {(() => {
          const grants  = staff.tool_grants ?? {}
          const hasTool = (k: string) => isAdmin || grants[k] === true || (k === 'smart_data' && staff.toolkit_access)
          const tiles = [
            { label: 'My Learning',           sub: 'Courses & AI Readiness Score',          color: '#00897B', href: `/dashboard?id=${staffId}`,                              icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>, show: true },
            { label: 'Course Library',        sub: 'Browse all courses',              color: '#6366F1', href: `/dashboard/library?id=${staffId}`,                       icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h6M3 15h6"/></svg>, show: true },
            { label: 'Talk to Pilot',         sub: 'AI learning assistant',           color: '#7C3AED', href: '/chat',                                                  icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, show: true },
            { label: 'Messages',              sub: 'Chat with colleagues',            color: '#1565C0', href: `/messages?id=${staffId}`,                                icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>, show: true },
            { label: 'AI Community',          sub: 'Share & discover prompts',        color: '#C2410C', href: `/community?id=${staffId}`,                                icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, show: true },
            { label: 'My Events',             sub: 'Event roles & tasks',             color: '#D97706', href: `/dashboard?id=${staffId}#events`,                        icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, show: true },
            { label: 'My HR',                 sub: 'Leave, pay & attendance',         color: '#EC4899', href: '/my-hr',                                                 icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, show: true },
            { label: 'Smart Data',            sub: 'Lead extraction & CRM',           color: '#00A5A3', href: '/data/extract/file',                                     icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>, show: hasTool('smart_data') },
            { label: 'HR Portal',             sub: 'Leave approvals & org ops',       color: '#BE185D', href: '/hr',                                                    icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>, show: hasTool('hr_portal') || staff.department === 'HR & Recruitment' || staff.department === 'HR' },
            { label: 'Team Dashboard',        sub: 'Team AIRS & progress',           color: '#8B5CF6', href: `/team?manager_id=${staffId}&staff_id=${staffId}`,        icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, show: !!(staff.has_reports || isAdmin) },
            { label: 'Intelligence',          sub: 'Market intel & AI research',      color: '#92400E', href: '/insights',                                              icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, show: hasTool('intelligence') },
            { label: 'Finance',               sub: 'P&L, payroll & expenses',         color: '#1565C0', href: '/admin/toolkit',                                         icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, show: hasTool('finance') || staff.department === 'Finance' },
            { label: 'Brand Studio',          sub: 'AI image & creative assets',      color: '#DC2626', href: '/admin/toolkit',                                         icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.477-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>, show: hasTool('brand_studio') },
            { label: 'Website Builder',       sub: 'Event sites & landing pages',     color: '#D97706', href: '/admin/toolkit',                                         icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>, show: hasTool('website_builder') },
            { label: 'Content Hub',           sub: 'Campaigns & social posts',        color: '#0EA5E9', href: '/content',                                               icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>, show: hasTool('content') || staff.department === 'Marketing' || staff.department === 'Content & Design' },
            { label: 'Admin Panel',           sub: 'Staff, permissions & ops',        color: '#0F1923', href: '/admin',                                                 icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>, show: !!isAdmin },
          ].filter(t => t.show)
          return (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: '12px' }}>Your Platform Access</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {tiles.map(t => (
                  <Link key={t.label} href={t.href} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '12px', background: '#FFFFFF', border: `1.5px solid ${t.color}25`, textDecoration: 'none', transition: 'border-color 0.15s, box-shadow 0.15s', flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.boxShadow = `0 2px 10px ${t.color}20` }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = `${t.color}25`; e.currentTarget.style.boxShadow = 'none' }}
                  >
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${t.color}12`, border: `1px solid ${t.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.color, flexShrink: 0 }}>
                      {t.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{t.label}</div>
                      <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '1px' }}>{t.sub}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })()}

        {/* AIRS explanation strip */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '16px', marginBottom: '24px' }}>
          {[
            { label: 'AI-Unaware', range: '0–14',   color: '#991B1B', bg: '#FEF2F2', border: '#FCA5A5' },
            { label: 'AI-Curious',  range: '15–34',  color: '#C2410C', bg: '#FFF7ED', border: '#FDBA74' },
            { label: 'AI-Aware',    range: '35–54',  color: '#92400E', bg: '#FFFBEB', border: '#FCD34D' },
            { label: 'AI-Ready',    range: '55–74',  color: '#0E7490', bg: '#ECFEFF', border: '#67E8F9' },
            { label: 'AI-Forward',  range: '75–100', color: '#166534', bg: '#F0FDF4', border: '#86EFAC' },
          ].map(t => {
            const isActive = tier === t.label
            return (
              <div key={t.label} style={{ flex: 1, padding: '11px 8px', background: isActive ? t.color : '#FFFFFF', border: `1.5px solid ${isActive ? t.color : '#DDE8EE'}`, borderRadius: '10px', textAlign: 'center', transition: 'all 0.2s ease',  }}>
                <div style={{ fontSize: '10px', fontWeight: 900, color: isActive ? 'rgba(255,255,255,0.9)' : t.color, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{t.label}</div>
                <div style={{ fontSize: '11px', color: isActive ? 'rgba(255,255,255,0.7)' : '#5B7080', marginTop: '3px', fontWeight: 600 }}>{t.range}</div>
              </div>
            )
          })}
        </div>

        {/* ── Stats strip / Journey kickstart ── */}
        {completedCount === 0 ? (
          /* Zero state — no courses completed yet */
          <div style={{ marginBottom: '24px' }}>
            <div style={{ background: 'linear-gradient(135deg, rgba(0,165,163,0.08) 0%, rgba(164,120,255,0.06) 100%)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '16px', padding: '24px 28px', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', color: '#00695C', textTransform: 'uppercase', marginBottom: '10px' }}>Your AI learning journey begins here</div>
              <p style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.65, margin: '0 0 20px' }}>
                You have been placed on the <strong style={{ color: '#0F1923' }}>{TRACK_LABEL[track]}</strong> based on your AI readiness score. Start your first course below — every course you complete moves your score forward and builds real skills you can use tomorrow.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {[
                  { step: '01', label: 'Start a course', sub: 'Pick any course and begin', color: '#00695C', bg: '#00695C' },
                  { step: '02', label: 'Pass the assessment', sub: '60% or higher to complete', color: '#A478FF', bg: '#A478FF' },
                  { step: '03', label: 'Watch your score climb', sub: 'AIRS updates as you learn', color: '#3D6B00', bg: '#3D6B00' },
                ].map(item => (
                  <div key={item.step} style={{ background: item.bg, borderRadius: '14px', padding: '18px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(255,255,255,0.7)', letterSpacing: '2px', marginBottom: '8px' }}>STEP {item.step}</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF', marginBottom: '4px' }}>{item.label}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.4 }}>{item.sub}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              <div style={{ background: '#00897B', borderRadius: '14px', padding: '18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: '32px', fontWeight: 900, color: '#FFFFFF', lineHeight: 1 }}>{courses.length}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>courses available</div>
                </div>
              </div>
              <div style={{ background: '#8B1A1A', borderRadius: '14px', padding: '18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: '32px', fontWeight: 900, color: '#FFFFFF', lineHeight: 1 }}>{totalMandatory}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>mandatory</div>
                </div>
              </div>
              <div style={{ background: trackConfig.color, borderRadius: '14px', padding: '18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 900, color: '#FFFFFF', lineHeight: 1 }}>{TRACK_LABEL[track]}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>your track</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Progress state — real stats */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {/* Completed */}
            <button
              onClick={() => document.getElementById('completed-section')?.scrollIntoView({ behavior: 'smooth' })}
              style={{ background: '#7DC520', borderRadius: '16px', padding: '20px', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', border: 'none' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '8px' }}>Completed</div>
              <div style={{ fontSize: '44px', fontWeight: 900, color: '#FFFFFF', marginBottom: '4px', lineHeight: 1 }}>{completedCount}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                View all
                <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </button>
            {/* Mandatory */}
            {(() => {
              const mandDone = completedMandatory >= totalMandatory
              const mandColor = mandDone ? '#7DC520' : '#8B1A1A'
              return (
                <div style={{ background: mandColor, borderRadius: '16px', padding: '20px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '8px' }}>Mandatory</div>
                  <div style={{ fontSize: '44px', fontWeight: 900, color: '#FFFFFF', marginBottom: '4px', lineHeight: 1 }}>{completedMandatory}<span style={{ fontSize: '20px', fontWeight: 700, opacity: 0.7 }}>/{totalMandatory}</span></div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>
                    {mandDone ? 'All done!' : `${totalMandatory - completedMandatory} remaining`}
                  </div>
                </div>
              )
            })()}
            {/* Track */}
            <div style={{ background: trackConfig.color, borderRadius: '16px', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '8px' }}>Your Track</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#FFFFFF', marginBottom: '4px', lineHeight: 1.1 }}>{TRACK_LABEL[track]}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>current learning level</div>
            </div>
          </div>
        )}

        {/* ── Two column: Next Up + Tip ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', marginBottom: '24px' }}>

          {/* Next Up */}
          {nextCourse ? (
            <div style={{ background: `linear-gradient(180deg, ${tierConfig.color}10 0%, #FFFFFF 50%)`, border: `1.5px solid ${tierConfig.border}`, borderTop: `5px solid ${tierConfig.color}`, borderRadius: '16px', padding: '28px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', color: tierConfig.color, textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Next Up
                {'rec_label' in nextCourse && 'rec_reason' in nextCourse && nextCourse.rec_label !== 'ai' && !!nextCourse.rec_reason && (
                  <span style={{ fontSize: '13px', fontWeight: 700, color: REC_LABEL_COLOR[nextCourse.rec_label as string] ?? tierConfig.color, background: `${REC_LABEL_COLOR[nextCourse.rec_label as string] ?? tierConfig.color}18`, padding: '2px 8px', borderRadius: '6px', letterSpacing: '0.5px', textTransform: 'none' }}>
                    {nextCourse.rec_reason as string}
                  </span>
                )}
                {'rec_label' in nextCourse && nextCourse.rec_label === 'ai' && (
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#A478FF', background: 'rgba(164,120,255,0.12)', border: '1px solid rgba(164,120,255,0.25)', padding: '2px 8px', borderRadius: '6px', letterSpacing: '0.5px', textTransform: 'none' }}>
                    AI-picked
                  </span>
                )}
              </div>
              {'rec_label' in nextCourse && 'rec_reason' in nextCourse && nextCourse.rec_label === 'ai' && !!nextCourse.rec_reason && (
                <div style={{ fontSize: '13px', color: 'rgba(164,120,255,0.9)', lineHeight: 1.65, marginBottom: '12px', fontStyle: 'italic' }}>
                  {nextCourse.rec_reason as string}
                </div>
              )}
              <h2 style={{ fontSize: '36px', fontWeight: 800, color: '#0F1923', margin: '0 0 6px', lineHeight: 1.25 }}>
                {nextCourse.title}
              </h2>
              <p style={{ fontSize: '13px', color: '#2D3E50', margin: '0 0 8px', lineHeight: 1.65 }}>
                {nextCourse.subtitle}
              </p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#2D3E50', background: '#FFFFFF', padding: '3px 10px', borderRadius: '16px' }}>
                  {nextCourse.estimated_minutes} min
                </span>
                {nextCourse.is_mandatory && (
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#8B1A1A', background: '#8B1A1A15', padding: '3px 10px', borderRadius: '16px' }}>
                    Mandatory
                  </span>
                )}
                {nextCourse.tool_name && (
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#2D3E50', background: '#FFFFFF', padding: '3px 10px', borderRadius: '16px' }}>
                    {nextCourse.tool_name}
                  </span>
                )}
              </div>
              <Link
                href={`/dashboard/course/${nextCourse.id}?staff_id=${staffId}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '14px 28px', background: tierConfig.color, color: '#FFFFFF', borderRadius: '12px', textDecoration: 'none', fontWeight: 800, fontSize: '14px', letterSpacing: '0.2px' }}
              >
                Start Course
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
              </Link>
            </div>
          ) : (
            <div style={{ background: 'rgba(192,244,60,0.05)', border: '1px solid rgba(192,244,60,0.2)', borderRadius: '16px', padding: '28px', display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#C0F43C20', border: '2px solid #C0F43C40', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="22" height="22" fill="none" stroke="#007A6E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#3D6B00', marginBottom: '6px' }}>Track Complete!</div>
                <p style={{ fontSize: '13px', color: '#2D3E50', margin: 0, lineHeight: 1.65 }}>
                  You've completed all {track} track courses. Explore the full library for more.
                </p>
                <Link href={`/dashboard/library?id=${staffId}`} style={{ display: 'inline-block', marginTop: '14px', fontSize: '13px', fontWeight: 700, color: '#3D6B00', textDecoration: 'underline' }}>
                  Browse Library
                </Link>
              </div>
            </div>
          )}

          {/* Daily tip */}
          <div style={{ background: '#E0F2F1', border: '1.5px solid #80CBC4', borderRadius: '16px', padding: '24px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', color: '#00695C', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="12" height="12" fill="none" stroke="#00695C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              Daily Tip
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F1923', marginBottom: '10px', lineHeight: 1.3 }}>
              {tip.title}
            </div>
            <p style={{ fontSize: '13px', color: '#2D3E50', margin: 0, lineHeight: 1.65 }}>
              {tip.body}
            </p>
          </div>
        </div>

        {/* ── Recommended For You ── */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '14px', fontWeight: 900, color: '#0F1923', margin: 0, letterSpacing: '-0.2px' }}>Recommended For You</h2>
                {aiRecsLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '12px', height: '12px', border: '2px solid rgba(164,120,255,0.3)', borderTopColor: '#A478FF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#A478FF', letterSpacing: '0.5px' }}>AI thinking…</span>
                  </div>
                )}
                {aiRecsReady && !aiRecsLoading && (
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#A478FF', background: 'rgba(164,120,255,0.12)', border: '1px solid rgba(164,120,255,0.25)', padding: '2px 8px', borderRadius: '16px', letterSpacing: '0.5px' }}>
                    AI-personalised
                  </span>
                )}
              </div>
              <div style={{ fontSize: '13px', color: '#2D3E50', marginTop: '2px' }}>
                {aiRecsReady ? 'Chosen by AI based on your role, tasks, and learning profile' : 'Ranked by your role, department, and learning track'}
              </div>
            </div>
            <Link href={`/dashboard/library?id=${staffId}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#00695C', background: 'rgba(0,165,163,0.12)', border: '1px solid rgba(0,165,163,0.3)', padding: '6px 14px', borderRadius: '16px', textDecoration: 'none' }}>
              Browse All
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(recList.length > 0 ? recList : courses.slice(0, 5)).filter(c => !dismissedIds.has(c.id)).map((course, idx) => {
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
                    padding: '18px 20px',
                    background: done ? '#FFFFFF' : isNext ? `linear-gradient(135deg, ${tierConfig.color}12 0%, #FFFFFF 70%)` : '#FFFFFF',
                    border: `1.5px solid ${isNext ? tierConfig.border : done ? '#DDE8EE' : '#DDE8EE'}`,
                    borderLeft: isNext ? `5px solid ${tierConfig.color}` : done ? `5px solid #7DC520` : `5px solid #DDE8EE`,
                    boxShadow: isNext ? `0 4px 16px ${tierConfig.color}22` : '0 1px 4px rgba(15,25,35,0.04)',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Step number / checkmark */}
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: done ? '#7DC520' : isNext ? tierConfig.color : '#E8EEF4', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: done ? '0 2px 8px rgba(125,197,32,0.4)' : isNext ? `0 2px 8px ${tierConfig.color}45` : 'none' }}>
                    {done
                      ? <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      : <span style={{ fontSize: '13px', fontWeight: 800, color: isNext ? '#FFFFFF' : '#5B7080' }}>{idx + 1}</span>
                    }
                  </div>
                  {/* Title + reason */}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: done ? '#0F1923' : '#0F1923', marginBottom: '4px' }}>{course.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: recReason && !done && recLabel === 'ai' ? '5px' : '0' }}>
                      <span style={{ fontSize: '13px', color: '#2D3E50' }}>{course.estimated_minutes} min</span>
                      {course.is_mandatory && (
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#8B1A1A', background: '#8B1A1A12', padding: '1px 7px', borderRadius: '5px' }}>Mandatory</span>
                      )}
                      {recReason && !done && recLabel !== 'ai' && (
                        <span style={{ fontSize: '13px', fontWeight: 700, color: labelColor, background: `${labelColor}15`, padding: '1px 7px', borderRadius: '5px' }}>
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
                  <div style={{ fontSize: '13px', fontWeight: 700, color: done ? '#3D6B00' : isNext ? tierConfig.color : '#0F1923', textAlign: 'right', flexShrink: 0 }}>
                    {done ? 'Done' : isNext ? 'Start' : 'View'}
                  </div>
                </Link>
                {!done && (
                  <button
                    onClick={e => { e.preventDefault(); dismissCourse(course.id) }}
                    title="Not for me"
                    style={{ position: 'absolute', top: '8px', right: '8px', width: '20px', height: '20px', borderRadius: '50%', border: 'none', background: '#FFFFFF', color: '#0F1923', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}
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
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '2px' }}>Course Library</div>
              <div style={{ fontSize: '13px', color: '#2D3E50' }}>{courses.length} courses across Foundation, Adoption &amp; Advanced tracks</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#00695C', flexShrink: 0 }}>
            Browse Library
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </Link>

        {/* ── What improves your score ── */}
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '24px 28px', marginBottom: '24px', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', margin: '0 0 16px' }}>How to move up from {tier}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {getImprovementTips(tier).map((tip, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: tierConfig.color, marginTop: '5px', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.65 }}>{tip}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Score Breakdown ── */}
        {tasks.length > 0 && (() => {
          const bd = scoreBreakdown
          const assessmentPct = Math.min(100, Math.round((bd.base / 75) * 100))
          return (
            <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '24px 28px', marginBottom: '24px', boxShadow: '0 1px 4px rgba(0,165,163,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', margin: 0 }}>How your AIRS score was calculated</h3>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', background: '#E8EEF4', padding: '3px 10px', borderRadius: '20px' }}>Total: {bd.total} / 100</span>
              </div>
              {/* Base score bar */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F1923' }}>Assessment score</div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: tierConfig.color }}>{bd.base} / 75 pts</div>
                </div>
                <div style={{ height: '8px', background: '#E8EEF4', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${assessmentPct}%`, background: tierConfig.color, borderRadius: '99px', transition: 'width 0.6s ease' }} />
                </div>
                <div style={{ fontSize: '11px', color: '#5B7080', marginTop: '4px' }}>
                  Average readiness rating: {bd.avg} / 5 across {tasks.length} profile question{tasks.length !== 1 ? 's' : ''}
                </div>
              </div>
              {/* Course bonus bar */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F1923' }}>Course completion bonus</div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#7C3AED' }}>+{bd.cappedBonus} / 25 pts max</div>
                </div>
                <div style={{ height: '8px', background: '#E8EEF4', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((bd.cappedBonus / 25) * 100)}%`, background: '#7C3AED', borderRadius: '99px', transition: 'width 0.6s ease' }} />
                </div>
                {bd.courseDetails.length > 0 ? (
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {bd.courseDetails.map((c, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#5B7080' }}>
                        <span>{c.title}</span>
                        <span style={{ fontWeight: 700, color: '#7C3AED' }}>+{c.points} pts ({c.tier})</span>
                      </div>
                    ))}
                    {bd.courseBonus > 25 && (
                      <div style={{ fontSize: '11px', color: '#C2410C', fontWeight: 600 }}>Course bonus capped at 25 pts (raw: +{bd.courseBonus})</div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: '#5B7080', marginTop: '4px' }}>No courses completed yet — each course adds bonus points</div>
                )}
              </div>
              {/* Points key */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '12px', borderTop: '1px solid #E8EEF4' }}>
                {[
                  { label: 'Foundation course', pts: '+1.5 pts', color: '#0E7490' },
                  { label: 'Adoption course', pts: '+2.5 pts', color: '#7C3AED' },
                  { label: 'Advanced course', pts: '+4 pts', color: '#166534' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#5B7080', background: '#F8FAFC', border: '1px solid #DDE8EE', borderRadius: '8px', padding: '4px 10px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                    <span>{item.label}:</span>
                    <span style={{ fontWeight: 800, color: item.color }}>{item.pts}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* ── AI Use Cases for Your Role ── */}
        {(() => {
          const dept = staff.department ?? ''
          const useCases = DEPT_USE_CASES[dept] ?? DEPT_USE_CASES['Events']
          const deptLabel = dept || 'Your Department'
          return (
            <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '24px 28px', marginBottom: '24px', boxShadow: '0 1px 4px rgba(0,165,163,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                <div>
                  <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', margin: '0 0 3px' }}>AI use cases for {deptLabel}</h3>
                  <div style={{ fontSize: '12px', color: '#5B7080' }}>Start with any one of these tomorrow morning</div>
                </div>
                <Link href="/community" style={{ fontSize: '12px', fontWeight: 700, color: '#00695C', textDecoration: 'none', background: 'rgba(0,105,92,0.08)', border: '1px solid rgba(0,105,92,0.2)', padding: '5px 12px', borderRadius: '8px' }}>
                  Share yours
                </Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                {useCases.map((uc, i) => (
                  <div key={i} style={{ background: '#F8FAFC', border: '1px solid #DDE8EE', borderRadius: '12px', padding: '14px 16px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F1923', marginBottom: '6px' }}>{uc.title}</div>
                    <div style={{ fontSize: '12px', color: '#5B7080', lineHeight: 1.55, marginBottom: '10px' }}>{uc.desc}</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 800, color: '#00695C', background: 'rgba(0,105,92,0.08)', border: '1px solid rgba(0,105,92,0.2)', padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
                      {uc.tool}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* ── Completed Courses ── */}
        {completedCount > 0 && (() => {
          const TRACK_COLORS: Record<string, { color: string; bg: string; label: string }> = {
            foundation: { color: '#0E7490', bg: 'rgba(14,116,144,0.12)',  label: 'Foundation' },
            adoption:   { color: '#7C3AED', bg: 'rgba(124,58,237,0.12)', label: 'Adoption'   },
            advanced:   { color: '#166534', bg: 'rgba(22,101,52,0.12)',  label: 'Advanced'   },
          }
          const done = completions.filter(c => c.passed && courses.some(cr => cr.id === c.course_id)).map(c => ({ ...c, course: courses.find(cr => cr.id === c.course_id) }))
          return (
            <div id="completed-section" style={{ background: 'rgba(192,244,60,0.03)', border: '1px solid rgba(192,244,60,0.15)', borderRadius: '16px', padding: '24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', margin: '0 0 4px' }}>Completed Courses</h3>
                  <div style={{ fontSize: '13px', color: '#2D3E50' }}>{completedCount} course{completedCount !== 1 ? 's' : ''} passed</div>
                </div>
                <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(192,244,60,0.12)', border: '2px solid rgba(192,244,60,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" fill="none" stroke="#007A6E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {done.map(({ course_id, test_score, course }) => {
                  const tc = TRACK_COLORS[course!.tier_level] ?? TRACK_COLORS.foundation
                  return (
                    <div key={course_id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', alignItems: 'center', gap: '14px', padding: '14px 18px', background: 'rgba(192,244,60,0.04)', border: '1px solid rgba(192,244,60,0.1)', borderRadius: '12px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(192,244,60,0.12)', border: '1.5px solid rgba(192,244,60,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="13" height="13" fill="none" stroke="#007A6E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '5px' }}>{course!.title}</div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: tc.color, background: tc.bg, padding: '2px 9px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tc.label}</span>
                          {test_score !== null && (
                            <span style={{ fontSize: '13px', color: '#2D3E50', fontWeight: 600 }}>Score: {test_score}%</span>
                          )}
                        </div>
                      </div>
                      <Link href={`/dashboard/course/${course!.id}?staff_id=${staffId}`} style={{ fontSize: '13px', fontWeight: 700, color: '#3D6B00', textDecoration: 'none', background: 'rgba(192,244,60,0.1)', border: '1px solid rgba(192,244,60,0.25)', padding: '7px 16px', borderRadius: '16px', whiteSpace: 'nowrap', flexShrink: 0 }}>
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

      {/* ── My Team's Learning (managers only) ── */}
      {teamCourses.length > 0 && (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', color: '#7C3AED', textTransform: 'uppercase' }}>My Team&apos;s Learning</div>
            <span style={{ fontSize: '13px', color: '#5B7080' }}>
              {teamCourses.filter(m => m.courses_done > 0).length}/{teamCourses.length} members started
            </span>
          </div>
          <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 120px 110px', gap: '12px', padding: '10px 20px', background: '#F8FAFC', borderBottom: '1px solid #DDE8EE' }}>
              {['Team Member', 'Done', 'Mandatory', 'Last Active'].map(h => (
                <div key={h} style={{ fontSize: '11px', fontWeight: 800, color: '#5B7080', letterSpacing: '1px', textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>
            {teamCourses.map((member, idx) => {
              const pct = member.total_courses > 0 ? Math.round((member.courses_done / member.total_courses) * 100) : 0
              const mandPct = member.mandatory_total > 0 ? Math.round((member.mandatory_done / member.mandatory_total) * 100) : 0
              const lastActive = member.last_activity
                ? new Date(member.last_activity).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                : 'Not started'
              return (
                <div
                  key={member.id}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 80px 120px 110px', gap: '12px', padding: '14px 20px', borderBottom: idx < teamCourses.length - 1 ? '1px solid #F1F5F9' : 'none', alignItems: 'center' }}
                >
                  {/* Name + role */}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '2px' }}>{member.name}</div>
                    <div style={{ fontSize: '12px', color: '#5B7080' }}>{member.role} · {member.department}</div>
                  </div>
                  {/* Courses done */}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: pct >= 50 ? '#3D6B00' : '#0F1923' }}>{member.courses_done}<span style={{ color: '#9CA3AF', fontWeight: 500 }}>/{member.total_courses}</span></div>
                    <div style={{ height: '4px', borderRadius: '2px', background: '#E8EEF4', marginTop: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, borderRadius: '2px', background: pct >= 50 ? '#7DC520' : '#00897B', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                  {/* Mandatory */}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: member.mandatory_done >= member.mandatory_total && member.mandatory_total > 0 ? '#3D6B00' : '#0F1923' }}>
                      {member.mandatory_done}<span style={{ color: '#9CA3AF', fontWeight: 500 }}>/{member.mandatory_total}</span>
                      {member.mandatory_done < member.mandatory_total && (
                        <span style={{ marginLeft: '6px', fontSize: '11px', fontWeight: 800, color: '#8B1A1A', background: '#8B1A1A12', padding: '1px 6px', borderRadius: '4px' }}>
                          {member.mandatory_total - member.mandatory_done} left
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Last active */}
                  <div style={{ fontSize: '13px', color: member.last_activity ? '#0F1923' : '#9CA3AF', fontWeight: member.last_activity ? 500 : 400 }}>
                    {lastActive}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── My Events section ── */}
      {events.length > 0 && (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px 32px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', color: '#00695C', textTransform: 'uppercase', marginBottom: '14px' }}>My Events</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {events.map(ev => (
              <div key={ev.id} style={{ background: 'rgba(0,165,163,0.05)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '14px', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{ev.name}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: ev.status === 'active' ? 'rgba(192,244,60,0.15)' : '#FFFFFF', color: ev.status === 'active' ? '#00695C' : '#2D3E50' }}>{ev.status}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#0F1923', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                    {ev.city && <span>{ev.city}</span>}
                    {ev.event_date && <span>{new Date(ev.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                    {ev.my_role && <span style={{ color: '#00695C', fontWeight: 600 }}>{ev.my_role}</span>}
                  </div>
                </div>
                <button
                  onClick={() => {
                    const chat = document.querySelector('[data-pilot-trigger]') as HTMLElement
                    if (chat) chat.click()
                  }}
                  style={{ padding: '8px 16px', borderRadius: '16px', border: '1px solid rgba(0,165,163,0.4)', background: 'rgba(0,165,163,0.1)', color: '#00695C', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  Talk to Pilot about this event
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
            <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', color: '#92400E', textTransform: 'uppercase' }}>My Event Tasks</div>
            <span style={{ fontSize: '13px', color: '#0F1923' }}>
              {myChecklist.filter(i => i.status === 'done').length}/{myChecklist.length} done
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {myChecklist.map(item => {
              const isLate = item.due_date && new Date(item.due_date) < new Date() && item.status !== 'done'
              const statusColors: Record<string, { color: string; bg: string }> = {
                not_started: { color: '#0F1923', bg: '#F1F5F9' },
                in_progress: { color: '#92400E', bg: 'rgba(245,158,11,0.1)' },
                done:        { color: '#3D6B00', bg: 'rgba(192,244,60,0.1)' },
                overdue:     { color: '#FF6B6B', bg: 'rgba(255,107,107,0.1)' },
              }
              const sc = statusColors[item.status] ?? statusColors.not_started

              return (
                <div key={item.id} style={{ background: '#FFFFFF', border: `1px solid ${isLate ? 'rgba(255,107,107,0.2)' : '#DDE8EE'}`, borderRadius: '12px', padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
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
                      {item.status === 'done' && <svg width="10" height="10" fill="none" stroke="#0F1923" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                      {item.status === 'in_progress' && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#F59E0B' }} />}
                    </button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: item.status === 'done' ? '#0F1923' : '#0F1923', textDecoration: item.status === 'done' ? 'line-through' : 'none' }}>
                          {item.title}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                          {item.status.replace('_', ' ')}
                        </span>
                        {isLate && <span style={{ fontSize: '13px', fontWeight: 700, color: '#FF6B6B' }}>Overdue</span>}
                      </div>
                      <div style={{ fontSize: '13px', color: '#0F1923', display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        {item.events?.name && <span>{item.events.name}</span>}
                        <span style={{ color: '#64748B' }}>{item.department}</span>
                        {item.due_date && <span style={{ color: isLate ? '#FF6B6B' : '#0F1923' }}>
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
                          style={{ flex: 1, padding: '7px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', resize: 'none' }}
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
                          style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#F59E0B', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
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
          <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', color: '#3D6B00', textTransform: 'uppercase', marginBottom: '14px' }}>Knowledge Base</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
            {docs.map(doc => {
              const typeColor: Record<string,string> = { policy: '#8B1A1A', event_brief: '#00897B', staff_doc: '#00695C', onboarding: '#A478FF', other: '#9CA3AF' }
              const tc = typeColor[doc.type] ?? 'rgba(255,255,255,0.4)'
              return (
                <div key={doc.id} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${tc}15`, border: `1px solid ${tc}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" fill="none" stroke={tc} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: tc, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{doc.type.replace('_', ' ')}</span>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '4px', lineHeight: 1.4 }}>{doc.title}</div>
                  <div style={{ fontSize: '13px', color: '#0F1923', marginBottom: '12px' }}>{doc.word_count?.toLocaleString()} words</div>
                  <Link href="/chat" style={{ fontSize: '13px', fontWeight: 700, color: tc, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Talk to Pilot about this
                    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Floating Talk to Pilot button ── */}
      <Link
        href={`/chat`}
        style={{ position: 'fixed', bottom: '28px', right: '28px', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 20px', background: '#00897B', borderRadius: '50px', textDecoration: 'none', zIndex: 100 }}
      >
        <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        <span style={{ fontSize: '13px', fontWeight: 800, color: 'white', letterSpacing: '0.1px' }}>Talk to Pilot</span>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C0F43C', animation: 'pulse 2s infinite' }} />
      </Link>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes demoGlow { 0%{color:#8B1A1A} 20%{color:#FF6B6B} 40%{color:#C0F43C} 60%{color:#00A5A3} 80%{color:#8B1A1A} 100%{color:#FFD08A} }
      `}</style>

      {/* ── Change Password ── */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 32px 24px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '22px 28px', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#E0F7F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <rect x="3" y="9" width="14" height="10" rx="2" stroke="#00695C" strokeWidth="1.5"/>
                  <path d="M6 9V6a4 4 0 0 1 8 0v3" stroke="#00695C" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="10" cy="14" r="1.5" fill="#00695C"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Change Password</div>
                <div style={{ fontSize: '13px', color: '#5B7080' }}>Update your account password</div>
              </div>
            </div>
            <button
              onClick={() => { setShowChangePw(v => !v); setCpError(''); setCpDone(false); setCpCurrent(''); setCpNew(''); setCpConfirm('') }}
              style={{ padding: '8px 18px', borderRadius: '10px', border: '1.5px solid #DDE8EE', background: showChangePw ? '#E0F7F6' : '#FFFFFF', color: showChangePw ? '#00695C' : '#0F1923', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
              {showChangePw ? 'Cancel' : 'Change'}
            </button>
          </div>

          {showChangePw && !cpDone && (
            <form onSubmit={async (e) => {
              e.preventDefault()
              if (!cpCurrent.trim()) { setCpError('Enter your current password.'); return }
              if (cpNew.length < 8)  { setCpError('New password must be at least 8 characters.'); return }
              if (cpNew === cpCurrent) { setCpError('New password must be different from current.'); return }
              if (cpNew !== cpConfirm) { setCpError('Passwords do not match.'); return }
              setCpLoading(true); setCpError('')
              try {
                const res  = await fetch('/api/change-password', {
                  method:  'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body:    JSON.stringify({ staff_id: staffId, current_password: cpCurrent, new_password: cpNew }),
                })
                const data = await res.json()
                if (!res.ok) { setCpError(data.error ?? 'Failed to change password.'); setCpLoading(false); return }
                setCpDone(true)
              } catch { setCpError('Something went wrong. Try again.') }
              finally { setCpLoading(false) }
            }} style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Current password */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0F1923', marginBottom: '6px' }}>Current password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showCpC ? 'text' : 'password'} value={cpCurrent} onChange={e => { setCpCurrent(e.target.value); setCpError('') }}
                    placeholder="Your current password"
                    style={{ width: '100%', padding: '11px 40px 11px 14px', borderRadius: '10px', border: '1.5px solid #DDE8EE', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#0F1923', fontFamily: 'inherit' }}
                    onFocus={e => (e.target.style.borderColor = '#00695C')}
                    onBlur={e  => (e.target.style.borderColor = '#DDE8EE')}
                  />
                  <button type="button" onClick={() => setShowCpC(v => !v)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#5B7080', padding: 0, display: 'flex', alignItems: 'center' }}>
                    {showCpC
                      ? <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 16 16"><path d="M2 2l12 12M6.5 6.6A2 2 0 0 0 9.4 9.5M4.2 4.3C2.6 5.4 1 8 1 8s2.5 5 7 5c1.4 0 2.7-.4 3.8-1M7 3.1C7.3 3 7.7 3 8 3c4.5 0 7 5 7 5s-.7 1.4-2 2.7"/></svg>
                      : <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" viewBox="0 0 16 16"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z"/><circle cx="8" cy="8" r="2"/></svg>}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0F1923', marginBottom: '6px' }}>
                  New password <span style={{ color: '#94A3B8', fontWeight: 500 }}>(min 8 characters)</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input type={showCpN ? 'text' : 'password'} value={cpNew} onChange={e => { setCpNew(e.target.value); setCpError('') }}
                    placeholder="Choose a strong password"
                    style={{ width: '100%', padding: '11px 40px 11px 14px', borderRadius: '10px', border: '1.5px solid #DDE8EE', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#0F1923', fontFamily: 'inherit' }}
                    onFocus={e => (e.target.style.borderColor = '#00695C')}
                    onBlur={e  => (e.target.style.borderColor = '#DDE8EE')}
                  />
                  <button type="button" onClick={() => setShowCpN(v => !v)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#5B7080', padding: 0, display: 'flex', alignItems: 'center' }}>
                    {showCpN
                      ? <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 16 16"><path d="M2 2l12 12M6.5 6.6A2 2 0 0 0 9.4 9.5M4.2 4.3C2.6 5.4 1 8 1 8s2.5 5 7 5c1.4 0 2.7-.4 3.8-1M7 3.1C7.3 3 7.7 3 8 3c4.5 0 7 5 7 5s-.7 1.4-2 2.7"/></svg>
                      : <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" viewBox="0 0 16 16"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z"/><circle cx="8" cy="8" r="2"/></svg>}
                  </button>
                </div>
                {cpNew.length > 0 && (
                  <div style={{ marginTop: '6px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {[cpNew.length >= 8, /[A-Z]/.test(cpNew), /[0-9]/.test(cpNew), /[^A-Za-z0-9]/.test(cpNew)].map((met, i) => (
                      <div key={i} style={{ height: '3px', flex: 1, borderRadius: '2px', background: met ? '#00695C' : '#DDE8EE', transition: 'background 0.2s' }} />
                    ))}
                    <span style={{ fontSize: '10px', color: '#5B7080', marginLeft: '4px', whiteSpace: 'nowrap' }}>
                      {cpNew.length < 8 ? 'Too short' : !/[A-Z]/.test(cpNew) ? 'Add uppercase' : !/[0-9]/.test(cpNew) ? 'Add number' : !/[^A-Za-z0-9]/.test(cpNew) ? 'Add symbol' : 'Strong'}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirm */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0F1923', marginBottom: '6px' }}>Confirm new password</label>
                <input type="password" value={cpConfirm} onChange={e => { setCpConfirm(e.target.value); setCpError('') }}
                  placeholder="Re-enter new password"
                  style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: `1.5px solid ${cpConfirm && cpConfirm !== cpNew ? '#FCA5A5' : '#DDE8EE'}`, fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#0F1923', fontFamily: 'inherit' }}
                  onFocus={e => (e.target.style.borderColor = '#00695C')}
                  onBlur={e  => (e.target.style.borderColor = cpConfirm && cpConfirm !== cpNew ? '#FCA5A5' : '#DDE8EE')}
                />
                {cpConfirm && cpConfirm !== cpNew && <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '4px' }}>Passwords do not match</div>}
              </div>

              {cpError && (
                <div style={{ background: '#FFF1F2', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#DC2626' }}>
                  {cpError}
                </div>
              )}

              <button type="submit" disabled={cpLoading}
                style={{ padding: '12px', borderRadius: '10px', background: cpLoading ? '#B8CDD8' : '#00695C', color: 'white', fontSize: '14px', fontWeight: 800, border: 'none', cursor: cpLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}>
                {cpLoading ? 'Saving…' : 'Update password'}
              </button>
            </form>
          )}

          {cpDone && (
            <div style={{ marginTop: '16px', padding: '14px 16px', background: 'rgba(0,105,92,0.08)', border: '1px solid rgba(0,105,92,0.2)', borderRadius: '10px', fontSize: '13px', color: '#00695C', fontWeight: 700 }}>
              Password updated successfully.
            </div>
          )}
        </div>
      </div>

      {/* ── My Submissions ── */}
      {myReviews.length > 0 && (
        <div id="my-submissions" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 32px 32px', scrollMarginTop: '80px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '12px' }}>My Submissions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {myReviews.map(r => {
              const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
                new:          { color: '#DC2626', bg: '#DC262615', label: 'New' },
                acknowledged: { color: '#D97706', bg: '#D9770615', label: 'Acknowledged' },
                in_progress:  { color: '#1565C0', bg: '#1565C015', label: 'In Progress' },
                resolved:     { color: '#059669', bg: '#05966915', label: 'Resolved' },
                wont_fix:     { color: '#5B7080', bg: '#5B708015', label: "Won't Fix" },
              }
              const sm = STATUS_COLORS[r.status] ?? STATUS_COLORS.new
              const adminReplies = r.comments.filter(c => !c.is_status_change && c.message)
              return (
                <div key={r.id} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                      <div style={{ fontSize: '11px', color: '#5B7080' }}>
                        Submitted {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {adminReplies.length > 0 && <> · <span style={{ color: '#00897B', fontWeight: 700 }}>{adminReplies.length} {adminReplies.length === 1 ? 'reply' : 'replies'} from team</span></>}
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px', background: sm.bg, color: sm.color, whiteSpace: 'nowrap' }}>{sm.label}</span>
                  </div>
                  {/* Trail — status changes + admin replies */}
                  {r.comments.length > 0 && (
                    <div style={{ borderTop: '1px solid #E8EEF4', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: '8px', background: '#F8FAFC' }}>
                      {r.comments.map(c => {
                        const sc = !c.is_status_change ? null : STATUS_COLORS[c.new_status ?? '']
                        return (
                          <div key={c.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                            <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: c.is_status_change ? (sc?.bg ?? '#E8EEF4') : 'rgba(0,137,123,0.08)', border: `1px solid ${c.is_status_change ? (sc?.color ?? '#DDE8EE') + '50' : 'rgba(0,137,123,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                              {c.is_status_change
                                ? <svg width="9" height="9" fill="none" stroke={sc?.color ?? '#5B7080'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                                : <svg width="9" height="9" fill="none" stroke="#00897B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                              }
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '11px', color: '#5B7080', marginBottom: c.message ? '4px' : '0' }}>
                                <span style={{ fontWeight: 700, color: '#0F1923' }}>{c.author_name}</span>
                                {c.is_status_change && c.new_status
                                  ? <> marked as <span style={{ fontWeight: 700, color: sc?.color ?? '#5B7080' }}>{STATUS_COLORS[c.new_status]?.label ?? c.new_status}</span></>
                                  : ' replied'
                                }
                                <span style={{ marginLeft: '6px' }}>
                                  {(() => { const d = Date.now() - new Date(c.created_at).getTime(); const m = Math.floor(d/60000); return m < 2 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m/60)}h ago` : `${Math.floor(m/1440)}d ago` })()}
                                </span>
                              </div>
                              {c.message && (
                                <div style={{ fontSize: '13px', color: '#0F1923', lineHeight: 1.65, background: '#FFFFFF', padding: '10px 12px', borderRadius: '8px', border: '1px solid #DDE8EE', whiteSpace: 'pre-wrap' }}>
                                  {c.message}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Feedback Card ── */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 32px 48px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '28px', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#A478FF', marginBottom: '8px' }}>Shape This Platform</div>
          <h3 style={{ fontSize: '36px', fontWeight: 900, color: '#0F1923', margin: '0 0 6px' }}>What should we build next?</h3>
          <p style={{ fontSize: '13px', color: '#0F1923', margin: '0 0 18px', lineHeight: 1.65 }}>
            Event Pilot is being built for you. If there is a feature, a course, a report, or anything else you would like to see — tell us here. Every suggestion is reviewed by the team.
          </p>
          {feedbackSent ? (
            <div style={{ padding: '16px', background: 'rgba(192,244,60,0.08)', border: '1px solid rgba(192,244,60,0.2)', borderRadius: '12px', fontSize: '13px', color: '#3D6B00', fontWeight: 700 }}>
              Thank you. Your feedback has been received and will be reviewed by the team.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <textarea
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder="e.g. I would like to see a leaderboard for our department, or a mobile app, or a course on AI for client presentations..."
                rows={4}
                style={{ width: '100%', padding: '14px 16px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '12px', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.65 }}
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
                style={{ alignSelf: 'flex-start', padding: '12px 24px', background: '#A478FF', border: 'none', borderRadius: '10px', color: 'white', fontSize: '13px', fontWeight: 800, cursor: !feedbackText.trim() || feedbackSending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: !feedbackText.trim() || feedbackSending ? 0.5 : 1 }}>
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
      <circle cx="55" cy="55" r={r} fill="none" stroke="#DDE8EE" strokeWidth="8" />
      <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 55 55)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
      <text x="55" y="52" textAnchor="middle" fill="#1E2124" fontSize="30" fontWeight="900" fontFamily="Manrope,sans-serif">{score}</text>
      <text x="55" y="68" textAnchor="middle" fill="#2A3038" fontSize="14" fontFamily="Manrope,sans-serif">/ 100</text>
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
      'Contribute a custom course to the Event Pilot library',
    ],
  }
  return tips[tier] ?? tips['AI-Curious']
}

/* ── Styles ── */
const S = {
  page: {
    fontFamily: 'var(--font-manrope), Manrope, sans-serif',
    background: '#E8EEF4',
    minHeight:  '100vh',
    color:      '#0F1923',
  },
  nav: {
    background:   '#FFFFFF',
    borderBottom: '1px solid #DDE8EE',
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
