'use client'

import { useEffect, useState } from 'react'
import type { LearningCompletion, LearningCourse, LearningStaff, LearningAttempt, NeverStarted, DeptParticipation } from './types'

export default function AnalyticsSection() {
  const [learningData, setLearningData] = useState<{ completions: LearningCompletion[]; courses: LearningCourse[]; staff: LearningStaff[]; attempts: LearningAttempt[]; never_started: NeverStarted[]; participation_by_dept: DeptParticipation[] } | null>(null)
  const [learningLoading, setLearningLoading] = useState(false)
  // Course assignment
  const [assignCourseId,    setAssignCourseId]    = useState('')
  const [assignTarget,      setAssignTarget]      = useState<'all' | 'dept' | 'individual'>('dept')
  const [assignCourseDept,  setAssignCourseDept]  = useState('')
  const [assignCourseStaff, setAssignCourseStaff] = useState('')
  const [assignDueDate,     setAssignDueDate]     = useState('')
  const [assigning,         setAssigning]         = useState(false)
  const [assignMsg,         setAssignMsg]         = useState<{ text: string; ok: boolean } | null>(null)

  async function fetchLearning() {
    if (learningData) return // already loaded
    setLearningLoading(true)
    const res = await fetch('/api/admin-learning')
    if (res.ok) setLearningData(await res.json())
    setLearningLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches this app's other top-level fetchAll effects
    fetchLearning()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (learningLoading) return (
    <div style={{ padding: '60px', textAlign: 'center' }}>
      <div style={{ width: '32px', height: '32px', border: '3px solid var(--border)', borderTopColor: 'var(--teal-mid)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
      <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading learning data…</div>
    </div>
  )
  if (!learningData) return (
    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>
      No learning data yet. Staff need to complete courses first.
    </div>
  )

  const { completions, courses, staff: ldStaff, attempts, never_started, participation_by_dept } = learningData
  const staffMap   = Object.fromEntries(ldStaff.map(s => [s.id, s]))
  const passedComp = completions.filter(c => c.passed)

  // Summary stats
  const totalAttempts   = attempts.length
  const totalPassed     = passedComp.length
  const passRate        = totalAttempts > 0 ? Math.round(totalPassed / totalAttempts * 100) : 0
  const avgScore        = passedComp.length > 0 ? Math.round(passedComp.reduce((s, c) => s + (c.test_score ?? 0), 0) / passedComp.length) : 0
  const activeStaff     = new Set(attempts.map(a => a.staff_id)).size
  // eslint-disable-next-line react-hooks/purity -- wall-clock "this week" cutoff for a display stat, not state; a stale value on re-render is harmless
  const thisWeek        = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const completionsThisWeek = passedComp.filter(c => new Date(c.completed_at) > thisWeek).length

  // Per-course stats
  const courseStats = courses.map(c => {
    const cComp    = completions.filter(x => x.course_id === c.id)
    const cAttempt = attempts.filter(x => x.course_id === c.id)
    const cPassed  = cComp.filter(x => x.passed)
    const cAvg     = cPassed.length > 0 ? Math.round(cPassed.reduce((s, x) => s + (x.test_score ?? 0), 0) / cPassed.length) : null
    return { ...c, completions: cPassed.length, attempts: cAttempt.length, avgScore: cAvg }
  }).sort((a, b) => b.completions - a.completions)

  // Per-dept stats
  const deptStats: Record<string, { name: string; completed: number; staff: number; avgScore: number }> = {}
  for (const comp of passedComp) {
    const s = staffMap[comp.staff_id]
    if (!s) continue
    const dept = s.department ?? 'Other'
    if (!deptStats[dept]) deptStats[dept] = { name: dept, completed: 0, staff: 0, avgScore: 0 }
    deptStats[dept].completed++
    deptStats[dept].avgScore = Math.round(((deptStats[dept].avgScore * (deptStats[dept].completed - 1)) + (comp.test_score ?? 0)) / deptStats[dept].completed)
  }
  const deptStatsList = Object.values(deptStats).sort((a, b) => b.completed - a.completed)

  // Top learners
  const learnerMap: Record<string, { name: string; dept: string; completed: number; avgScore: number }> = {}
  for (const comp of passedComp) {
    const s = staffMap[comp.staff_id]
    if (!s) continue
    if (!learnerMap[comp.staff_id]) learnerMap[comp.staff_id] = { name: s.name, dept: s.department ?? '—', completed: 0, avgScore: 0 }
    learnerMap[comp.staff_id].completed++
    learnerMap[comp.staff_id].avgScore = Math.round(((learnerMap[comp.staff_id].avgScore * (learnerMap[comp.staff_id].completed - 1)) + (comp.test_score ?? 0)) / learnerMap[comp.staff_id].completed)
  }
  const topLearners = Object.entries(learnerMap).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.completed - a.completed || b.avgScore - a.avgScore).slice(0, 10)

  const TIER_COLOR: Record<string, string> = { foundation: '#F1667A', adoption: '#0EA79D', advanced: '#C0F43C' }

  return (
    <div>
      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '24px' }}>
        {[
          { label: 'Courses Available',   value: courses.length,         sub: 'in library',          accent: 'var(--teal-mid)' },
          { label: 'Total Completions',    value: totalPassed,            sub: 'passes recorded',     accent: '#7DC520' },
          { label: 'This Week',            value: completionsThisWeek,    sub: 'completed',           accent: '#AF70E3' },
          { label: 'Avg Passing Score',    value: avgScore ? `${avgScore}%` : '—', sub: 'across all passes', accent: '#F5B94D' },
          { label: 'Active Learners',      value: activeStaff,            sub: 'attempted a course',  accent: 'var(--red)' },
        ].map(({ label, value, sub, accent }) => (
          <div key={label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `4px solid ${accent}`, borderRadius: '14px', padding: '20px', boxShadow: '0 2px 8px rgba(15,25,35,0.05)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '10px' }}>{label}</div>
            <div style={{ fontSize: '36px', fontWeight: 900, color: accent, marginBottom: '4px', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)', fontWeight: 600 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', marginBottom: '20px' }}>

        {/* Course completion table */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>Course Performance</div>
            <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '2px' }}>Completions and avg score per course</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 48px 56px', padding: '8px 20px', borderBottom: '1px solid var(--border)', gap: '8px' }}>
            {['Course', 'Track', 'Done', 'Avg'].map(h => (
              <div key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{h}</div>
            ))}
          </div>
          {courseStats.map((c, i) => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 48px 56px', padding: '12px 20px', borderBottom: i < courseStats.length - 1 ? '1px solid var(--surface)' : 'none', gap: '8px', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>{c.title}</div>
                {c.is_mandatory && <div style={{ fontSize: '13px', color: 'var(--red)', marginTop: '2px' }}>Mandatory</div>}
              </div>
              <div><span style={{ fontSize: '13px', fontWeight: 700, color: TIER_COLOR[c.tier_level] ?? '#0EA79D', background: `${TIER_COLOR[c.tier_level] ?? '#0EA79D'}15`, padding: '2px 7px', borderRadius: '5px', textTransform: 'capitalize' }}>{c.tier_level}</span></div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: c.completions > 0 ? 'var(--ink)' : 'var(--border)' }}>{c.completions}</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: c.avgScore ? (c.avgScore >= 80 ? 'var(--lime)' : c.avgScore >= 70 ? 'var(--teal)' : 'var(--red)') : 'var(--border)' }}>{c.avgScore ? `${c.avgScore}%` : '—'}</div>
            </div>
          ))}
          {courseStats.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>No courses yet. Seed courses first.</div>
          )}
        </div>

        {/* Right column: Dept stats + Top learners */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Dept completion */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>By Department</div>
            </div>
            {deptStatsList.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink)', fontSize: '13px' }}>No completions yet</div>
            ) : (
              deptStatsList.map((d, i) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 18px', borderBottom: i < deptStatsList.length - 1 ? '1px solid var(--surface)' : 'none' }}>
                  <div style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{d.name}</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', minWidth: '24px', textAlign: 'right' }}>{d.completed}</div>
                  <div style={{ fontSize: '13px', color: d.avgScore >= 80 ? 'var(--lime)' : 'var(--teal)', fontWeight: 700, minWidth: '40px', textAlign: 'right' }}>{d.avgScore}%</div>
                </div>
              ))
            )}
          </div>

          {/* Top learners */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>Top Learners</div>
            </div>
            {topLearners.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink)', fontSize: '13px' }}>No completions yet</div>
            ) : (
              topLearners.map((l, i) => (
                <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 36px 44px', alignItems: 'center', gap: '10px', padding: '10px 18px', borderBottom: i < topLearners.length - 1 ? '1px solid var(--surface)' : 'none' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: i < 3 ? 'var(--lime)' : 'var(--ink3)' }}>#{i + 1}</div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{l.name}</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink)' }}>{l.dept}</div>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', textAlign: 'right' }}>{l.completed}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: l.avgScore >= 80 ? 'var(--lime)' : 'var(--teal)', textAlign: 'right' }}>{l.avgScore}%</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Pass rate strip */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px 22px', display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '4px' }}>Overall Pass Rate</div>
          <div style={{ fontSize: '36px', fontWeight: 900, color: passRate >= 70 ? 'var(--lime)' : passRate >= 50 ? 'var(--red)' : 'var(--red)' }}>{passRate}%</div>
        </div>
        <div style={{ flex: 1, maxWidth: '400px' }}>
          <div style={{ height: '8px', background: 'var(--surface)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${passRate}%`, background: passRate >= 70 ? '#7DC520' : passRate >= 50 ? 'var(--red)' : 'var(--red)', borderRadius: '4px', transition: 'width 0.6s' }} />
          </div>
          <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '5px' }}>{totalPassed} passes out of {totalAttempts} total attempts</div>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>
          Target: 70%+ pass rate across all courses.<br/>Below 70% on any course = content or prompt difficulty issue.
        </div>
      </div>

      {/* ── Participation section ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

        {/* Department participation rates */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>Participation by Department</div>
            <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '2px' }}>% of staff who have attempted at least one course</div>
          </div>
          {(participation_by_dept ?? []).length === 0 ? (
            <div style={{ padding: '28px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>No data yet</div>
          ) : (
            (participation_by_dept ?? []).map((d, i) => {
              const rate = d.total > 0 ? Math.round((d.active / d.total) * 100) : 0
              return (
                <div key={d.dept} style={{ padding: '12px 20px', borderBottom: i < (participation_by_dept ?? []).length - 1 ? '1px solid var(--surface)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{d.dept}</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: rate >= 70 ? 'var(--lime)' : rate >= 40 ? '#F5B94D' : 'var(--red)' }}>{rate}% <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>({d.active}/{d.total})</span></div>
                  </div>
                  <div style={{ height: '5px', background: 'var(--surface)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${rate}%`, background: rate >= 70 ? '#7DC520' : rate >= 40 ? 'var(--amber)' : 'var(--red)', borderRadius: '3px', transition: 'width 0.5s' }} />
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Never-started summary */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>Never Started</div>
              <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '2px' }}>Staff who have not attempted any course</div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: (never_started ?? []).length > 0 ? 'var(--red)' : 'var(--lime)' }}>{(never_started ?? []).length}</div>
          </div>
          {(never_started ?? []).length === 0 ? (
            <div style={{ padding: '28px', textAlign: 'center', color: 'var(--lime)', fontSize: '13px', fontWeight: 600 }}>All active staff have started at least one course.</div>
          ) : (
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {(never_started ?? []).slice(0, 25).map((s, i) => (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '12px', padding: '10px 20px', borderBottom: i < Math.min((never_started ?? []).length, 25) - 1 ? '1px solid var(--surface)' : 'none' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{s.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{s.role ?? '—'} · {s.department ?? '—'}</div>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--amber)', background: 'var(--amber-light)', padding: '3px 8px', borderRadius: '5px', whiteSpace: 'nowrap' }}>{s.office_id}</div>
                </div>
              ))}
              {(never_started ?? []).length > 25 && (
                <div style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--ink3)', textAlign: 'center' }}>+{(never_started ?? []).length - 25} more staff not shown</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Assign a Course ── */}
      <div style={{ marginTop: '16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase', color: 'var(--info)', marginBottom: '4px' }}>Course Assignment</div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Assign a course to staff</div>
          </div>
          <svg width="18" height="18" fill="none" stroke="var(--info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
        </div>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Course</label>
            <select value={assignCourseId} onChange={e => setAssignCourseId(e.target.value)}
              style={{ width: '100%', padding: '10px 13px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--border-light)', fontSize: '13px', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' }}>
              <option value="">Select a course…</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.title} ({c.tier_level})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Assign to</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['dept', 'individual', 'all'] as const).map(t => (
                <button key={t} onClick={() => setAssignTarget(t)}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${assignTarget === t ? 'var(--info)' : 'var(--border)'}`, background: assignTarget === t ? 'rgba(21,101,192,0.08)' : 'var(--border-light)', color: assignTarget === t ? 'var(--info)' : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {t === 'dept' ? 'Department' : t === 'individual' ? 'Individual' : 'All Staff'}
                </button>
              ))}
            </div>
          </div>
          {assignTarget === 'dept' && (
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Department</label>
              <select value={assignCourseDept} onChange={e => setAssignCourseDept(e.target.value)}
                style={{ width: '100%', padding: '10px 13px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--border-light)', fontSize: '13px', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' }}>
                <option value="">Select department…</option>
                {Array.from(new Set(ldStaff.map(s => s.department).filter(Boolean))).sort().map(d => (
                  <option key={d} value={d!}>{d}</option>
                ))}
              </select>
            </div>
          )}
          {assignTarget === 'individual' && (
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Staff Member</label>
              <select value={assignCourseStaff} onChange={e => setAssignCourseStaff(e.target.value)}
                style={{ width: '100%', padding: '10px 13px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--border-light)', fontSize: '13px', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' }}>
                <option value="">Select staff member…</option>
                {ldStaff.slice().sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                  <option key={s.id} value={s.id}>{s.name} — {s.department ?? '—'} ({s.role})</option>
                ))}
              </select>
            </div>
          )}
          {assignTarget === 'all' && (
            <div style={{ padding: '12px 16px', background: 'rgba(21,101,192,0.05)', border: '1px solid rgba(21,101,192,0.15)', borderRadius: '10px', fontSize: '13px', color: 'var(--info)' }}>
              This will assign the course to all {ldStaff.length} active staff members.
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Due Date (optional)</label>
            <input type="date" value={assignDueDate} onChange={e => setAssignDueDate(e.target.value)}
              style={{ padding: '10px 13px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--border-light)', fontSize: '13px', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              disabled={assigning || !assignCourseId || (assignTarget === 'dept' && !assignCourseDept) || (assignTarget === 'individual' && !assignCourseStaff)}
              onClick={async () => {
                if (!assignCourseId) return
                setAssigning(true); setAssignMsg(null)
                try {
                  let targets: string[] = []
                  if (assignTarget === 'all') {
                    targets = ldStaff.map(s => s.id)
                  } else if (assignTarget === 'dept') {
                    targets = ldStaff.filter(s => s.department === assignCourseDept).map(s => s.id)
                  } else {
                    targets = assignCourseStaff ? [assignCourseStaff] : []
                  }
                  if (targets.length === 0) { setAssignMsg({ text: 'No staff found for selection.', ok: false }); setAssigning(false); return }
                  const bulk = targets.map(sid => ({ staff_id: sid, course_id: assignCourseId, due_date: assignDueDate || undefined, assigned_by: 'admin' }))
                  const res = await fetch('/api/hr/course-assignments', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bulk }),
                  })
                  const data = await res.json()
                  if (res.ok) {
                    setAssignMsg({ text: `Assigned to ${data.assigned} staff member${data.assigned !== 1 ? 's' : ''}. They will see it in their dashboard.`, ok: true })
                    setAssignCourseId(''); setAssignCourseDept(''); setAssignCourseStaff(''); setAssignDueDate('')
                  } else {
                    setAssignMsg({ text: data.error ?? 'Assignment failed.', ok: false })
                  }
                } finally { setAssigning(false) }
              }}
              style={{ padding: '11px 24px', borderRadius: '10px', border: 'none', background: assigning || !assignCourseId ? 'var(--border)' : 'var(--info)', color: assigning || !assignCourseId ? 'var(--ink3)' : 'var(--info-light)', fontSize: '13px', fontWeight: 800, cursor: assigning || !assignCourseId ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {assigning ? 'Assigning…' : 'Assign Course'}
            </button>
            {assignMsg && (
              <div style={{ fontSize: '13px', color: assignMsg.ok ? 'var(--lime)' : 'var(--red)', fontWeight: 600 }}>{assignMsg.text}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
