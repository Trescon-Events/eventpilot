'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import NavBar, { MOD_EVENTPILOT } from '@/app/components/NavBar'

interface Course {
  id:                 string
  title:              string
  subtitle:           string
  tool_name:          string | null
  tier_level:         'foundation' | 'adoption' | 'advanced'
  dept_tags:          string[]
  is_mandatory:       boolean
  estimated_minutes:  number
  overview:           string
  source:             string
  created_at:         string
  suggested_by_name:  string | null
  suggested_by_role:  string | null
}

interface Completion {
  course_id:     string
  passed:        boolean
  test_score:    number | null
  attempt_count: number
}

interface Assignment {
  id:         string
  course_id:  string
  status:     string
  due_date:   string | null
  course:     { id: string; title: string; is_mandatory: boolean; duration_hours: number | null }
}

const TIER_CONFIG = {
  foundation: { color: '#0E7490', bg: '#0E749015', border: '#0E749040', label: 'Foundation' },
  adoption:   { color: '#7C3AED', bg: '#7C3AED15', border: '#7C3AED40', label: 'Adoption'   },
  advanced:   { color: '#166534', bg: '#16653415', border: '#16653440', label: 'Advanced'   },
}

const DEPTS = ['All Departments', 'Marketing', 'Sales & Sponsorship', 'Events', 'Content & Design', 'IT', 'Finance', 'HR & Recruitment', 'Operations', 'DemandifyMedia', 'Leadership']

function LibraryContent() {
  const params  = useSearchParams()
  const staffId = params.get('id') ?? ''

  const [courses,      setCourses]      = useState<Course[]>([])
  const [completions,  setCompletions]  = useState<Completion[]>([])
  const [assignments,  setAssignments]  = useState<Assignment[]>([])
  const [loading,      setLoading]      = useState(true)
  const [tierFilter,   setTierFilter]   = useState<string>('all')
  const [deptFilter,   setDeptFilter]   = useState<string>('All Departments')
  const [myDept,       setMyDept]       = useState<string>('All Departments')
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    const [cRes, compRes, sessionRes, assignRes] = await Promise.all([
      fetch('/api/courses'),
      staffId ? fetch(`/api/staff-completions?staff_id=${staffId}`) : Promise.resolve(null),
      fetch('/api/auth/session'),
      staffId ? fetch(`/api/hr/course-assignments?staff_id=${staffId}`) : Promise.resolve(null),
    ])
    const cData = await cRes.json()
    setCourses(Array.isArray(cData) ? cData : [])

    if (compRes?.ok) {
      const compData = await compRes.json()
      setCompletions(Array.isArray(compData) ? compData : [])
    }

    if (sessionRes.ok) {
      const sess = await sessionRes.json()
      if (sess?.dept) {
        setMyDept(sess.dept)
        setDeptFilter(sess.dept)
      }
    }

    if (assignRes?.ok) {
      const aData = await assignRes.json()
      setAssignments(Array.isArray(aData) ? aData : [])
    }

    setLoading(false)
  }

  const completionMap = new Map(completions.map(c => [c.course_id, c]))

  const filtered = courses.filter(c => {
    if (tierFilter !== 'all' && c.tier_level !== tierFilter) return false
    if (deptFilter !== 'All Departments') {
      if (c.dept_tags.length > 0 && !c.dept_tags.includes(deptFilter)) return false
    }
    if (sourceFilter !== 'all' && c.source !== sourceFilter) return false
    return true
  })

  const completedCount       = completions.filter(c => c.passed).length
  const foundationCount      = courses.filter(c => c.tier_level === 'foundation').length
  const adoptionCount        = courses.filter(c => c.tier_level === 'adoption').length
  const advancedCount        = courses.filter(c => c.tier_level === 'advanced').length
  const mandatoryUncompleted = courses.filter(c => c.is_mandatory && !completionMap.get(c.id)?.passed)

  // Pending assignments (not yet completed)
  const pendingAssignments = assignments.filter(a => a.status !== 'completed' && a.course)
  const assignedCourseIds  = new Set(pendingAssignments.map(a => a.course_id))

  return (
    <div style={S.page}>
      {/* Nav */}
      <NavBar
        module={MOD_EVENTPILOT}
        subtitle="Course Library"
        homeHref={staffId ? `/dashboard?id=${staffId}` : '/dashboard'}
        rightSlot={staffId ? (
          <Link href={`/dashboard?id=${staffId}`} className="tbtn tbtn-teal">
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            My Dashboard
          </Link>
        ) : undefined}
      />

      <div style={{ maxWidth: '1020px', margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2.5px', color: '#00695C', textTransform: 'uppercase', marginBottom: '8px' }}>Event Pilot Learning Library</div>
          <h1 style={{ fontSize: '36px', fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.4px', color: '#0F1923' }}>Course Library</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <p style={{ fontSize: '13px', color: '#2D3E50', margin: 0 }}>
              {courses.length} total · {completedCount} completed by you
            </p>
            {myDept !== 'All Departments' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#00897B', background: 'rgba(0,165,163,0.1)', border: '1px solid rgba(0,165,163,0.25)', padding: '3px 10px', borderRadius: '16px' }}>
                  {myDept}
                </span>
                {deptFilter === myDept ? (
                  <button
                    onClick={() => setDeptFilter('All Departments')}
                    style={{ fontSize: '12px', color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontFamily: 'inherit' }}
                  >
                    Show all depts
                  </button>
                ) : (
                  <button
                    onClick={() => setDeptFilter(myDept)}
                    style={{ fontSize: '12px', color: '#00897B', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontFamily: 'inherit', fontWeight: 700 }}
                  >
                    Back to {myDept}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tier summary strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '28px' }}>
          {(['foundation', 'adoption', 'advanced'] as const).map(tier => {
            const cfg   = TIER_CONFIG[tier]
            const count = tier === 'foundation' ? foundationCount : tier === 'adoption' ? adoptionCount : advancedCount
            const done  = completions.filter(c => c.passed && courses.find(cr => cr.id === c.course_id)?.tier_level === tier).length
            return (
              <button
                key={tier}
                onClick={() => setTierFilter(tierFilter === tier ? 'all' : tier)}
                style={{
                  padding: '20px 22px', borderRadius: '14px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                  background: tierFilter === tier ? cfg.bg : '#FFFFFF',
                  border: `1px solid ${tierFilter === tier ? cfg.border : '#DDE8EE'}`,
                  borderTop: `4px solid ${cfg.color}`,
                  boxShadow: tierFilter === tier ? `0 4px 14px ${cfg.color}22` : '0 2px 8px rgba(15,25,35,0.06)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 800, color: cfg.color, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>{cfg.label}</div>
                <div style={{ fontSize: '40px', fontWeight: 900, color: '#0F1923', lineHeight: 1, marginBottom: '6px' }}>{count}</div>
                <div style={{ fontSize: '12px', color: '#2D3E50', fontWeight: 600 }}>{done} completed by you</div>
              </button>
            )
          })}
        </div>

        {/* Assigned to You — pinned section */}
        {pendingAssignments.length > 0 && tierFilter === 'all' && sourceFilter === 'all' && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#7C3AED', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '2px' }}>
                Assigned to You — {pendingAssignments.length} pending
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {pendingAssignments.map(a => {
                const course = courses.find(c => c.id === a.course_id)
                if (!course) return null
                const cfg = TIER_CONFIG[course.tier_level]
                const overdue = a.due_date && new Date(a.due_date) < new Date()
                return (
                  <Link
                    key={a.id}
                    href={`/dashboard/course/${course.id}${staffId ? `?staff_id=${staffId}` : ''}`}
                    style={{ display: 'flex', flexDirection: 'column', background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: '16px', padding: '20px', textDecoration: 'none' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#7C3AED', background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', padding: '3px 9px', borderRadius: '16px' }}>Assigned</span>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: cfg.color, background: cfg.bg, padding: '3px 9px', borderRadius: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>{cfg.label}</span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '6px', lineHeight: 1.3, flex: 1 }}>{course.title}</div>
                    <div style={{ fontSize: '13px', color: '#2D3E50', marginBottom: '14px', lineHeight: 1.65 }}>{course.subtitle}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(124,58,237,0.15)', paddingTop: '10px' }}>
                      <span style={{ fontSize: '12px', color: overdue ? '#8B1A1A' : '#6B7280', fontWeight: 600 }}>
                        {a.due_date ? (overdue ? `Overdue — ${a.due_date}` : `Due ${a.due_date}`) : 'No deadline'}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#7C3AED' }}>Start</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Mandatory — pinned section */}
        {mandatoryUncompleted.length > 0 && tierFilter === 'all' && sourceFilter === 'all' && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#8B1A1A', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#8B1A1A', textTransform: 'uppercase', letterSpacing: '2px' }}>
                Mandatory — {mandatoryUncompleted.length} remaining
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {mandatoryUncompleted.map(course => {
                const cfg = TIER_CONFIG[course.tier_level]
                return (
                  <Link
                    key={course.id}
                    href={`/dashboard/course/${course.id}${staffId ? `?staff_id=${staffId}` : ''}`}
                    style={{ display: 'flex', flexDirection: 'column', background: 'rgba(139,26,26,0.06)', border: '1px solid rgba(139,26,26,0.3)', borderRadius: '16px', padding: '20px', textDecoration: 'none' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#8B1A1A', background: 'rgba(139,26,26,0.15)', border: '1px solid rgba(139,26,26,0.35)', padding: '3px 9px', borderRadius: '16px' }}>Mandatory</span>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: cfg.color, background: cfg.bg, padding: '3px 9px', borderRadius: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>{cfg.label}</span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '6px', lineHeight: 1.3, flex: 1 }}>{course.title}</div>
                    <div style={{ fontSize: '13px', color: '#2D3E50', marginBottom: '14px', lineHeight: 1.65 }}>{course.subtitle}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(139,26,26,0.15)', paddingTop: '10px' }}>
                      <span style={{ fontSize: '13px', color: '#2D3E50', fontWeight: 600 }}>{course.estimated_minutes} min</span>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#8B1A1A' }}>Start Now</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* All Courses — section header + filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#00897B', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', textTransform: 'uppercase', letterSpacing: '2px' }}>All Courses</span>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'center' }}>
          {/* Source filter */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { val: 'all',    label: 'All Sources' },
              { val: 'manual', label: 'Event Pilot Curated' },
              { val: 'gemini', label: 'AI Generated' },
            ].map(({ val, label }) => (
              <button key={val} onClick={() => setSourceFilter(val)} style={{ padding: '7px 14px', borderRadius: '16px', border: `1px solid ${sourceFilter === val ? '#00897B' : '#DDE8EE'}`, background: sourceFilter === val ? '#00A5A315' : '#FFFFFF', color: sourceFilter === val ? '#00897B' : '#2D3E50', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {label}
              </button>
            ))}
          </div>

          {/* Dept filter */}
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            style={{ padding: '7px 14px', borderRadius: '16px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#2D3E50', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
          >
            {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <div style={{ fontSize: '13px', color: '#2D3E50', marginLeft: 'auto' }}>
            {filtered.length} course{filtered.length !== 1 ? 's' : ''} shown
          </div>
        </div>

        {/* Course grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ width: '36px', height: '36px', border: '3px solid #DDE8EE', borderTopColor: '#00897B', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
            <div style={{ color: '#0F1923', fontSize: '13px' }}>Loading library…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#2D3E50', fontSize: '13px' }}>
            No courses match the current filters.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {filtered.map(course => {
              const completion = completionMap.get(course.id)
              const done       = completion?.passed ?? false
              const attempted  = (completion?.attempt_count ?? 0) > 0
              const cfg        = TIER_CONFIG[course.tier_level]

              return (
                <Link
                  key={course.id}
                  href={`/dashboard/course/${course.id}${staffId ? `?staff_id=${staffId}` : ''}`}
                  style={{
                    display: 'flex', flexDirection: 'column',
                    background: done ? 'rgba(192,244,60,0.04)' : '#FFFFFF',
                    border: `1px solid ${done ? 'rgba(192,244,60,0.2)' : '#DDE8EE'}`,
                    boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)',
                    borderRadius: '16px', padding: '22px', textDecoration: 'none',
                    transition: 'border-color 0.15s ease, transform 0.15s ease',
                    cursor: 'pointer',
                  }}
                >
                  {/* Top row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, padding: '3px 9px', borderRadius: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        {cfg.label}
                      </span>
                      {course.is_mandatory && (
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#8B1A1A', background: '#8B1A1A12', padding: '3px 9px', borderRadius: '16px' }}>Mandatory</span>
                      )}
                      {course.source === 'gemini' && (
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#A78BFA', background: '#A78BFA12', padding: '3px 9px', borderRadius: '16px' }}>AI</span>
                      )}
                    </div>
                    {done && (
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(0,137,123,0.12)', border: '1.5px solid #00897B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="10" height="10" fill="none" stroke="#00695C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '6px', lineHeight: 1.3, flex: 1 }}>
                    {course.title}
                  </div>
                  <div style={{ fontSize: '13px', color: '#0F1923', marginBottom: '16px', lineHeight: 1.5 }}>
                    {course.subtitle}
                  </div>

                  {/* Suggested by attribution */}
                  {course.suggested_by_name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', padding: '6px 10px', background: 'rgba(164,120,255,0.07)', border: '1px solid rgba(164,120,255,0.15)', borderRadius: '8px' }}>
                      <div style={{ width: '18px', height: '18px', borderRadius: '5px', background: 'rgba(164,120,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '13px', fontWeight: 900, color: '#A478FF' }}>{course.suggested_by_name.charAt(0)}</span>
                      </div>
                      <span style={{ fontSize: '13px', color: '#2D3E50' }}>
                        Suggested by <strong style={{ color: '#A478FF', fontWeight: 700 }}>{course.suggested_by_name}</strong>
                        {course.suggested_by_role && <span> · {course.suggested_by_role}</span>}
                      </span>
                    </div>
                  )}

                  {/* Footer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #DDE8EE', paddingTop: '12px' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <span style={{ fontSize: '13px', color: '#2D3E50', fontWeight: 600 }}>{course.estimated_minutes} min</span>
                      {course.tool_name && <span style={{ fontSize: '13px', color: '#2D3E50', fontWeight: 600 }}>{course.tool_name}</span>}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: done ? '#3D6B00' : attempted ? '#8B1A1A' : '#0F1923' }}>
                      {done ? 'Passed' : attempted ? `Score: ${completion?.test_score ?? 0}%` : 'Not started'}
                    </div>
                  </div>
                </Link>
              )
            })}
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

export default function LibraryPage() {
  return (
    <Suspense>
      <LibraryContent />
    </Suspense>
  )
}
