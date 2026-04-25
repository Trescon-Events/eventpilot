'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface Course {
  id:                string
  title:             string
  subtitle:          string
  tool_name:         string | null
  tier_level:        'foundation' | 'adoption' | 'advanced'
  dept_tags:         string[]
  is_mandatory:      boolean
  estimated_minutes: number
  overview:          string
  source:            string
  created_at:        string
}

interface Completion {
  course_id:     string
  passed:        boolean
  test_score:    number | null
  attempt_count: number
}

const TIER_CONFIG = {
  foundation: { color: '#FF9F43', bg: '#FF9F4315', border: '#FF9F4340', label: 'Foundation' },
  adoption:   { color: '#00A5A3', bg: '#00A5A315', border: '#00A5A340', label: 'Adoption'   },
  advanced:   { color: '#C0F43C', bg: '#C0F43C15', border: '#C0F43C40', label: 'Advanced'   },
}

const DEPTS = ['All Departments', 'Marketing', 'Sales & Sponsorship', 'Events', 'Content & Design', 'IT', 'Finance', 'HR & Recruitment', 'Operations', 'DemandifyMedia', 'Leadership']

function LibraryContent() {
  const params  = useSearchParams()
  const staffId = params.get('id') ?? ''

  const [courses,     setCourses]     = useState<Course[]>([])
  const [completions, setCompletions] = useState<Completion[]>([])
  const [loading,     setLoading]     = useState(true)
  const [tierFilter,  setTierFilter]  = useState<string>('all')
  const [deptFilter,  setDeptFilter]  = useState<string>('All Departments')
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    const [cRes, compRes] = await Promise.all([
      fetch('/api/courses'),
      staffId ? fetch(`/api/staff-completions?staff_id=${staffId}`) : Promise.resolve(null),
    ])
    const cData = await cRes.json()
    setCourses(Array.isArray(cData) ? cData : [])
    if (compRes?.ok) {
      const compData = await compRes.json()
      setCompletions(Array.isArray(compData) ? compData : [])
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

  const completedCount  = completions.filter(c => c.passed).length
  const foundationCount = courses.filter(c => c.tier_level === 'foundation').length
  const adoptionCount   = courses.filter(c => c.tier_level === 'adoption').length
  const advancedCount   = courses.filter(c => c.tier_level === 'advanced').length

  return (
    <div style={S.page}>
      {/* Nav */}
      <nav style={S.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', background: '#00A5A3', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <span style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>TAI</span>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>Course Library</span>
        </div>
        {staffId && (
          <Link href={`/dashboard?id=${staffId}`} style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            My Dashboard
          </Link>
        )}
      </nav>

      <div style={{ maxWidth: '1020px', margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2.5px', color: '#00A5A3', textTransform: 'uppercase', marginBottom: '8px' }}>TAI Learning Library</div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, margin: '0 0 6px', letterSpacing: '-0.4px', color: 'white' }}>All Courses</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)', margin: 0 }}>
            {courses.length} courses · {completedCount} completed by you
          </p>
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
                  padding: '16px 18px', borderRadius: '14px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                  background: tierFilter === tier ? cfg.bg : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${tierFilter === tier ? cfg.border : 'rgba(255,255,255,0.08)'}`,
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontSize: '10px', fontWeight: 800, color: cfg.color, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '6px' }}>{cfg.label}</div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: 'white', marginBottom: '2px' }}>{count}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>{done} completed</div>
              </button>
            )
          })}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'center' }}>
          {/* Source filter */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { val: 'all',    label: 'All Sources' },
              { val: 'manual', label: 'TAI Curated' },
              { val: 'gemini', label: 'AI Generated' },
            ].map(({ val, label }) => (
              <button key={val} onClick={() => setSourceFilter(val)} style={{ padding: '7px 14px', borderRadius: '20px', border: `1px solid ${sourceFilter === val ? '#00A5A3' : 'rgba(255,255,255,0.12)'}`, background: sourceFilter === val ? '#00A5A315' : 'transparent', color: sourceFilter === val ? '#00A5A3' : 'rgba(255,255,255,0.6)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {label}
              </button>
            ))}
          </div>

          {/* Dept filter */}
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            style={{ padding: '7px 14px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)', background: '#1A1D20', color: 'rgba(255,255,255,0.8)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
          >
            {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginLeft: 'auto' }}>
            {filtered.length} course{filtered.length !== 1 ? 's' : ''} shown
          </div>
        </div>

        {/* Course grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ width: '36px', height: '36px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#00A5A3', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '13px' }}>Loading library…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.45)', fontSize: '14px' }}>
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
                    background: done ? 'rgba(192,244,60,0.04)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${done ? 'rgba(192,244,60,0.2)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '16px', padding: '22px', textDecoration: 'none',
                    transition: 'border-color 0.15s ease, transform 0.15s ease',
                    cursor: 'pointer',
                  }}
                >
                  {/* Top row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, padding: '3px 9px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        {cfg.label}
                      </span>
                      {course.is_mandatory && (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#FF9F43', background: '#FF9F4312', padding: '3px 9px', borderRadius: '20px' }}>Mandatory</span>
                      )}
                      {course.source === 'gemini' && (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#A78BFA', background: '#A78BFA12', padding: '3px 9px', borderRadius: '20px' }}>AI</span>
                      )}
                    </div>
                    {done && (
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#C0F43C20', border: '1.5px solid #C0F43C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="10" height="10" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'white', marginBottom: '6px', lineHeight: 1.3, flex: 1 }}>
                    {course.title}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginBottom: '16px', lineHeight: 1.5 }}>
                    {course.subtitle}
                  </div>

                  {/* Footer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>{course.estimated_minutes} min</span>
                      {course.tool_name && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>{course.tool_name}</span>}
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: done ? '#C0F43C' : attempted ? '#FF9F43' : 'rgba(255,255,255,0.35)' }}>
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

export default function LibraryPage() {
  return (
    <Suspense>
      <LibraryContent />
    </Suspense>
  )
}
