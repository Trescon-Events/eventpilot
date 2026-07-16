'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { NotificationBell } from '@/app/components/NavBar'
import PageHeader from '@/app/components/PageHeader'

type Member = {
  id: string
  name: string
  email: string
  department: string | null
  role: string | null
  office_id: string
  job_level: string
  team: string | null
  manager_id: string | null
  airs_score: number
  tier: string
  track: string
  completed_courses: number
  last_active: string | null
}

type Manager = {
  id: string
  name: string
  role: string | null
  department: string | null
  office_id: string
  job_level: string
}

const TIER_COLOR: Record<string, string> = {
  'AI-Forward': '#166534',
  'AI-Ready':   '#0E7490',
  'AI-Aware':   '#92400E',
  'AI-Curious': '#C2410C',
  'AI-Unaware': '#991B1B',
}

const OFFICE_LABEL: Record<string, string> = {
  dubai:     'Dubai',
  bangalore: 'Bangalore',
  mangalore: 'Mangalore',
  manipal:   'Manipal',
}

const JOB_LEVEL_LABEL: Record<string, string> = {
  staff:        'Staff',
  team_lead:    'Team Lead',
  dept_head:    'Dept Head',
  office_head:  'Office Head',
  super_admin:  'Super Admin',
}

function avg(arr: number[]) {
  return arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0
}

function daysSince(dateStr: string | null) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

function TeamContent() {
  const params    = useSearchParams()
  const managerId = params.get('manager_id')
  const staffId   = params.get('staff_id') // own id — for "My Dashboard" link

  const [manager,     setManager]     = useState<Manager | null>(null)
  const [members,     setMembers]     = useState<Member[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [deptFilter,  setDeptFilter]  = useState('all')
  const [officeFilter,setOfficeFilter]= useState('all')
  const [search,      setSearch]      = useState('')

  // Team Health Brief
  const [briefState,  setBriefState]  = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [brief,       setBrief]       = useState('')
  const [briefStats,  setBriefStats]  = useState<{ avgScore: number; teamSize: number; zeroCourses: number; noProfile: number } | null>(null)
  const [gapDept,     setGapDept]     = useState<string | null>(null)

  async function generateBrief() {
    if (!managerId || briefState === 'loading') return
    setBriefState('loading')
    setBrief('')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    try {
      const res  = await fetch('/api/team-brief', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ manager_id: managerId }),
        signal:  controller.signal,
      })
      const data = await res.json()
      if (!res.ok || data.error) { setBriefState('error'); return }
      setBrief(data.brief)
      setBriefStats(data.stats)
      setGapDept(data.gap_dept)
      setBriefState('ready')
    } catch {
      setBriefState('error')
    } finally {
      clearTimeout(timeout)
    }
  }

  useEffect(() => {
    if (!managerId) { setError('No manager ID provided.'); setLoading(false); return }
    fetch(`/api/team?manager_id=${managerId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setManager(data.manager)
        setMembers(data.members ?? [])
      })
      .catch(() => setError('Failed to load team data.'))
      .finally(() => setLoading(false))
  }, [managerId])

  if (loading) return (
    <div style={{ fontFamily: 'var(--font-manrope),Manrope,sans-serif', background: '#E8EEF4', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '36px', height: '36px', border: '3px solid #DDE8EE', borderTopColor: '#00897B', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
        <div style={{ color: '#2D3E50', fontSize: '13px' }}>Loading team data…</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (error) return (
    <div style={{ fontFamily: 'var(--font-manrope),Manrope,sans-serif', background: '#E8EEF4', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0F1923' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#FF6B6B', marginBottom: '8px', fontSize: '13px' }}>Error</div>
        <p style={{ color: '#2D3E50', fontSize: '13px' }}>{error}</p>
        <Link href={staffId ? `/dashboard?id=${staffId}` : '/dashboard'} style={{ color: '#00695C', fontSize: '13px' }}>
          Back to My Dashboard
        </Link>
      </div>
    </div>
  )

  if (!loading && members.length === 0) return (
    <div style={{ fontFamily: 'var(--font-manrope),Manrope,sans-serif', background: '#E8EEF4', minHeight: '100vh', color: '#0F1923' }}>
      {/* Page header */}
      <PageHeader title="Team Dashboard" actions={<NotificationBell />} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 64px)', padding: '40px 24px', textAlign: 'center' }}>
        {/* Icon */}
        <div style={{ width: '72px', height: '72px', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #B8CDD8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
          <svg width="32" height="32" fill="none" stroke="#0F1923" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>

        <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#00695C', marginBottom: '12px' }}>Team Dashboard</div>
        <h2 style={{ fontSize: '36px', fontWeight: 800, color: '#0F1923', margin: '0 0 10px' }}>No team members assigned yet</h2>
        <p style={{ fontSize: '13px', color: '#2D3E50', maxWidth: '380px', lineHeight: 1.65, margin: '0 0 32px' }}>
          Your team dashboard is ready, but no direct reports have been linked to your profile.<br/>
          Contact your administrator to have team members added.
        </p>

        {staffId && (
          <Link
            href={`/dashboard?id=${staffId}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: 'white', background: '#00897B', padding: '12px 22px', borderRadius: '10px', textDecoration: 'none' }}
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            Back to My Dashboard
          </Link>
        )}
      </div>
    </div>
  )

  // Filters
  const depts   = Array.from(new Set(members.map(m => m.department).filter(Boolean))) as string[]
  const offices = Array.from(new Set(members.map(m => m.office_id)))

  const filtered = members.filter(m => {
    if (deptFilter   !== 'all' && m.department !== deptFilter)   return false
    if (officeFilter !== 'all' && m.office_id  !== officeFilter) return false
    if (search.trim() && !m.name.toLowerCase().includes(search.toLowerCase()) &&
        !m.role?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Summary stats
  const avgScore     = avg(members.map(m => m.airs_score))
  const totalDone    = members.reduce((s, m) => s + m.completed_courses, 0)
  const activeCount  = members.filter(m => m.last_active && daysSince(m.last_active) !== null).length
  const tierCounts   = Object.fromEntries(Object.keys(TIER_COLOR).map(t => [t, members.filter(m => m.tier === t).length]))

  const scopeLabel = manager?.job_level === 'super_admin' ? 'Full Organisation'
    : manager?.job_level === 'office_head' ? `${OFFICE_LABEL[manager.office_id] ?? manager.office_id} Office`
    : manager?.job_level === 'dept_head'   ? `${manager.department} Department`
    : 'Your Team'

  return (
    <div style={{ fontFamily: 'var(--font-manrope),Manrope,sans-serif', background: '#E8EEF4', minHeight: '100vh', color: '#0F1923' }}>

      {/* Page header */}
      <PageHeader
        eyebrow={scopeLabel}
        title={`${manager?.name}'s Team`}
        description={`${manager?.role} · ${JOB_LEVEL_LABEL[manager?.job_level ?? ''] ?? manager?.job_level} · ${members.length} people reporting`}
      />

      <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}>
          {[
            { label: 'Team Size',          value: members.length,   sub: 'total reports',        accent: '#00897B' },
            { label: 'Avg AI Readiness Score',    value: avgScore,          sub: 'team average',          accent: '#6B21A8' },
            { label: 'Courses Completed',  value: totalDone,         sub: 'across team',           accent: '#7DC520' },
            { label: 'Active Learners',    value: activeCount,       sub: 'completed a course',    accent: '#D97706' },
          ].map(({ label, value, sub, accent }) => (
            <div key={label} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderLeft: `4px solid ${accent}`, borderRadius: '14px', padding: '20px 22px', boxShadow: '0 2px 8px rgba(15,25,35,0.06)' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>{label}</div>
              <div style={{ fontSize: '40px', fontWeight: 900, color: '#0F1923', marginBottom: '4px', lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: '13px', color: '#5B7080', fontWeight: 600 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Tier distribution */}
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', padding: '18px 24px', marginBottom: '20px', display: 'flex', gap: '8px', alignItems: 'stretch', flexWrap: 'wrap', boxShadow: '0 2px 8px rgba(15,25,35,0.06)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1.5px', flexShrink: 0, display: 'flex', alignItems: 'center', marginRight: '8px' }}>AI Readiness</div>
          {Object.entries(tierCounts).map(([tier, count]) => count > 0 && (
            <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 12px', background: `${TIER_COLOR[tier]}12`, border: `1px solid ${TIER_COLOR[tier]}40`, borderRadius: '8px' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: TIER_COLOR[tier], flexShrink: 0 }} />
              <span style={{ fontSize: '13px', fontWeight: 800, color: TIER_COLOR[tier] }}>{tier}</span>
              <span style={{ fontSize: '14px', fontWeight: 900, color: '#0F1923', marginLeft: '2px' }}>{count}</span>
            </div>
          ))}
        </div>

        {/* ── Team Health Brief ── */}
        <div style={{ marginBottom: '28px', background: 'rgba(0,165,163,0.05)', border: '1px solid rgba(0,165,163,0.18)', borderRadius: '16px', overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: briefState === 'ready' ? '1px solid rgba(0,165,163,0.15)' : 'none' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#00695C', marginBottom: '4px' }}>AI-Powered</div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Team Health Brief</div>
              <div style={{ fontSize: '13px', color: '#2D3E50', marginTop: '2px' }}>
                Built from your team&apos;s real activity data — AI Readiness Scores, course progress, and profile completion.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {briefState === 'ready' && (
                <button
                  onClick={generateBrief}
                  style={{ fontSize: '13px', fontWeight: 700, color: '#2D3E50', background: 'none', border: '1px solid #B8CDD8', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Regenerate
                </button>
              )}
              {(briefState === 'idle' || briefState === 'error') && (
                <button
                  onClick={generateBrief}
                  style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 800, color: 'white', background: '#00897B', border: 'none', padding: '9px 20px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  Generate Brief
                </button>
              )}
              {briefState === 'loading' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#00695C', fontWeight: 700 }}>
                  <div style={{ width: '16px', height: '16px', border: '2px solid rgba(0,165,163,0.3)', borderTopColor: '#00897B', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Analysing team data…
                </div>
              )}
            </div>
          </div>

          {/* Brief content */}
          {briefState === 'ready' && brief && (
            <div style={{ padding: '24px' }}>
              {/* Stat pills */}
              {briefStats && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  {[
                    { label: 'Avg AIRS', value: briefStats.avgScore, color: '#00695C' },
                    { label: 'Team Size', value: briefStats.teamSize, color: '#2D3E50' },
                    { label: 'No Courses Yet', value: briefStats.zeroCourses, color: '#8B1A1A' },
                    { label: 'Profile Pending', value: briefStats.noProfile, color: '#A478FF' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: '#FFFFFF', border: '1px solid #B8CDD8', borderRadius: '10px', padding: '8px 14px', display: 'flex', gap: '6px', alignItems: 'baseline', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
                      <span style={{ fontSize: '36px', fontWeight: 900, color }}>{value}</span>
                      <span style={{ fontSize: '13px', color: '#2D3E50', fontWeight: 600 }}>{label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Brief text — render paragraphs and bullets */}
              <div style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.65 }}>
                {brief.split('\n').map((line, i) => {
                  if (!line.trim()) return <div key={i} style={{ height: '8px' }} />
                  if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
                    return (
                      <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '6px' }}>
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00897B', marginTop: '9px', flexShrink: 0 }} />
                        <span>{line.replace(/^[-•]\s/, '')}</span>
                      </div>
                    )
                  }
                  if (/^\d+\./.test(line.trim())) {
                    return <p key={i} style={{ margin: '0 0 6px', fontWeight: 700, color: '#0F1923' }}>{line}</p>
                  }
                  return <p key={i} style={{ margin: '0 0 10px' }}>{line}</p>
                })}
              </div>

              {/* CTA to Content Studio */}
              {gapDept && (
                <div style={{ marginTop: '20px', padding: '18px 20px', background: 'rgba(164,120,255,0.08)', border: '1px solid rgba(164,120,255,0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '3px' }}>
                      Biggest gap: <span style={{ color: '#A478FF' }}>{gapDept}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#2D3E50' }}>
                      Request a course built specifically for this team — it will be live in the library within minutes.
                    </div>
                  </div>
                  <a
                    href={`/admin?tab=suggest&gap=${encodeURIComponent(gapDept)}`}
                    style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 800, color: '#6D28D9', background: '#F5F3FF', border: '1px solid #DDD6FE', padding: '9px 18px', borderRadius: '10px', textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Request a Course
                  </a>
                </div>
              )}

              {/* Platform impact note */}
              <div style={{ marginTop: '16px', fontSize: '13px', color: '#0F1923', lineHeight: 1.65, borderTop: '1px solid #DDE8EE', paddingTop: '14px' }}>
                Your team&apos;s engagement data directly shapes what Event Pilot builds next. Courses requested here go into the live library — and are immediately recommended to staff who need them most.
              </div>
            </div>
          )}

          {briefState === 'error' && (
            <div style={{ padding: '20px 24px', fontSize: '13px', color: '#FF6B6B' }}>
              Could not generate the brief. Please try again in a moment.
            </div>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '0 0 220px' }}>
            <svg width="12" height="12" fill="none" stroke="#0F1923" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or role…"
              style={{ width: '100%', paddingLeft: '32px', paddingRight: '12px', paddingTop: '7px', paddingBottom: '7px', borderRadius: '16px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Dept filter */}
          {depts.length > 1 && (
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: '16px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
              <option value="all">All Departments</option>
              {depts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}

          {/* Office filter */}
          {offices.length > 1 && (
            <select value={officeFilter} onChange={e => setOfficeFilter(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: '16px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
              <option value="all">All Offices</option>
              {offices.map(o => <option key={o} value={o}>{OFFICE_LABEL[o] ?? o}</option>)}
            </select>
          )}

          <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#2D3E50', fontWeight: 600 }}>
            {filtered.length} of {members.length} shown
          </div>
        </div>

        {/* Team member list */}
        {filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#2D3E50', fontSize: '13px' }}>
            No team members match your filters.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 100px 100px 80px', gap: '12px', padding: '8px 20px', fontSize: '13px', fontWeight: 700, color: '#0F1923', textTransform: 'uppercase', letterSpacing: '1px' }}>
              <span>Name / Role</span>
              <span>Department</span>
              <span>AIRS</span>
              <span>Track</span>
              <span>Courses Done</span>
              <span>Last Active</span>
            </div>

            {filtered.map(m => {
              const tc = TIER_COLOR[m.tier] ?? '#aaa'
              return (
                <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 100px 100px 80px', gap: '12px', alignItems: 'center', padding: '14px 20px', background: '#FFFFFF', border: '1px solid #B8CDD8', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '2px' }}>{m.name}</div>
                    <div style={{ fontSize: '13px', color: '#5B7080' }}>
                      {m.role ?? '—'} · {JOB_LEVEL_LABEL[m.job_level] ?? m.job_level} · {OFFICE_LABEL[m.office_id] ?? m.office_id}
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', color: '#2D3E50' }}>{m.department ?? '—'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 900, color: tc }}>{m.airs_score}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: tc, background: `${tc}18`, padding: '2px 7px', borderRadius: '6px' }}>{m.tier.replace('AI-', '')}</span>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#2D3E50', textTransform: 'capitalize' }}>{m.track}</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: m.completed_courses > 0 ? '#00695C' : '#0F1923' }}>
                    {m.completed_courses}
                  </div>
                  <div style={{ fontSize: '13px', color: '#2D3E50' }}>
                    {daysSince(m.last_active) ?? 'Never'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

export default function TeamPage() {
  return (
    <Suspense>
      <TeamContent />
    </Suspense>
  )
}
