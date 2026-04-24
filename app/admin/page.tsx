'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/app/lib/supabase'
import Link from 'next/link'

const OFFICES = [
  { id: 'dubai',     label: 'Dubai',     total: 15,  color: '#00A5A3' },
  { id: 'bangalore', label: 'Bangalore', total: 91,  color: '#C0F43C' },
  { id: 'mangalore', label: 'Mangalore', total: 15,  color: '#F4ED3C' },
  { id: 'manipal',   label: 'Manipal',   total: 63,  color: '#FF6B6B' },
]
const TOTAL = 184

const DEPT_ORDER = [
  'Events', 'Sales & Sponsorship', 'Marketing', 'Finance', 'Operations',
  'IT', 'HR & Recruitment', 'Content & Design', 'Government Relations',
  'DemandifyMedia', 'Leadership', 'Other',
]

type Member = {
  id: string; name: string; email: string; office_id: string
  department: string | null; role: string | null
  profile_complete: boolean; joined_at: string
}

type TaskProfile = {
  id: string; staff_id: string; task_name: string
  task_description: string | null; tools_used: string[]
  time_taken_today: string | null; ai_time_estimate: string | null
  skill_needed: string | null; ai_readiness: number | null
  frequency: string | null; created_at: string
}

export default function AdminPage() {
  const [authed, setAuthed]   = useState(false)
  const [code, setCode]       = useState('')
  const [codeError, setCodeError] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [tasks, setTasks]     = useState<TaskProfile[]>([])
  const [tab, setTab]         = useState<'overview' | 'members' | 'intelligence'>('overview')
  const [officeFilter, setOfficeFilter] = useState('all')
  const [deptFilter, setDeptFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [expandedTask, setExpandedTask] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: m }, { data: t }] = await Promise.all([
      supabase.from('staff_members').select('*').order('joined_at', { ascending: false }),
      supabase.from('staff_task_profiles').select('*').order('created_at', { ascending: false }),
    ])
    setMembers((m ?? []) as Member[])
    setTasks((t ?? []) as TaskProfile[])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authed) return
    fetchData()
    const ch = supabase.channel('admin-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_members' }, fetchData)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_task_profiles' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [authed, fetchData])

  function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    if (code.trim() === (process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026')) {
      setAuthed(true)
    } else { setCodeError('Incorrect access code.') }
  }

  /* ── Derived ── */
  const totalJoined      = members.length
  const profilesComplete = members.filter(m => m.profile_complete).length
  const profilePending   = totalJoined - profilesComplete
  const totalTasks       = tasks.length
  const readinessList    = tasks.filter(t => t.ai_readiness).map(t => t.ai_readiness!)
  const avgReadiness     = readinessList.length ? (readinessList.reduce((a, b) => a + b, 0) / readinessList.length).toFixed(1) : '—'

  const officeMap: Record<string, { label: string; total: number; color: string; count: number }> = {}
  for (const o of OFFICES) officeMap[o.id] = { ...o, count: 0 }
  for (const m of members) if (officeMap[m.office_id]) officeMap[m.office_id].count++

  const deptMap: Record<string, { joined: number; complete: number }> = {}
  for (const m of members) {
    const d = m.department ?? 'Other'
    if (!deptMap[d]) deptMap[d] = { joined: 0, complete: 0 }
    deptMap[d].joined++
    if (m.profile_complete) deptMap[d].complete++
  }

  const allDepts = [...new Set(members.map(m => m.department ?? 'Other'))].sort()

  const filteredMembers = members.filter(m =>
    (officeFilter === 'all' || m.office_id === officeFilter) &&
    (deptFilter === 'all' || (m.department ?? 'Other') === deptFilter)
  )

  const memberIndex = Object.fromEntries(members.map(m => [m.id, m]))

  const filteredTasks = tasks.filter(t => {
    const m = memberIndex[t.staff_id]
    return (officeFilter === 'all' || m?.office_id === officeFilter) &&
      (deptFilter === 'all' || (m?.department ?? 'Other') === deptFilter)
  })

  const getOffice = (id: string) => OFFICES.find(o => o.id === id)

  /* ── AI Readiness breakdown ── */
  const readinessDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of readinessList) { if (r >= 1 && r <= 5) readinessDist[r]++ }
  const readinessLabels: Record<number, string> = {
    1: 'Never used AI', 2: 'Tried ChatGPT', 3: 'Occasional user',
    4: 'Comfortable', 5: 'Power user',
  }
  const readinessColors = ['#FF6B6B', '#FF9F43', '#F4ED3C', '#A8E6CF', '#C0F43C']

  /* ── Most common tools ── */
  const toolCount: Record<string, number> = {}
  for (const t of tasks) for (const tool of (t.tools_used ?? [])) toolCount[tool] = (toolCount[tool] ?? 0) + 1
  const topTools = Object.entries(toolCount).sort((a, b) => b[1] - a[1]).slice(0, 8)

  /* ── AI readiness per office ── */
  const officeReadiness: Record<string, number[]> = {}
  for (const t of tasks) {
    if (!t.ai_readiness) continue
    const m = memberIndex[t.staff_id]
    if (!m) continue
    if (!officeReadiness[m.office_id]) officeReadiness[m.office_id] = []
    officeReadiness[m.office_id].push(t.ai_readiness)
  }
  const officeScores = OFFICES.map(o => {
    const scores = officeReadiness[o.id] ?? []
    const avg    = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
    return { ...o, avg, count: scores.length }
  }).filter(o => o.avg !== null).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))

  /* ── AI readiness per department ── */
  const deptReadiness: Record<string, number[]> = {}
  for (const t of tasks) {
    if (!t.ai_readiness) continue
    const m = memberIndex[t.staff_id]
    if (!m) continue
    const dept = m.department ?? 'Other'
    if (!deptReadiness[dept]) deptReadiness[dept] = []
    deptReadiness[dept].push(t.ai_readiness)
  }
  const deptScores = Object.entries(deptReadiness).map(([dept, scores]) => ({
    dept,
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    count: scores.length,
  })).sort((a, b) => b.avg - a.avg)

  /* ── Top individuals (highest avg readiness) ── */
  const memberReadiness: Record<string, number[]> = {}
  for (const t of tasks) {
    if (!t.ai_readiness) continue
    if (!memberReadiness[t.staff_id]) memberReadiness[t.staff_id] = []
    memberReadiness[t.staff_id].push(t.ai_readiness)
  }
  const topIndividuals = Object.entries(memberReadiness)
    .map(([id, scores]) => {
      const m   = memberIndex[id]
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      return { id, name: m?.name ?? 'Unknown', office: m?.office_id ?? '', dept: m?.department ?? '—', avg }
    })
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 8)

  /* ── Score → label + color ── */
  function scoreLabel(avg: number) {
    if (avg >= 4.5) return { label: 'AI Champion', color: '#C0F43C' }
    if (avg >= 3.5) return { label: 'AI Ready', color: '#A8E6CF' }
    if (avg >= 2.5) return { label: 'Developing', color: '#F4ED3C' }
    if (avg >= 1.5) return { label: 'Early Stage', color: '#FF9F43' }
    return { label: 'Not Started', color: '#FF6B6B' }
  }

  /* ── Login screen ── */
  if (!authed) {
    return (
      <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: 'linear-gradient(155deg, #464D53 0%, #010103 60%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '24px', padding: '48px 40px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', background: '#00A5A320', border: '2px solid #00A5A3', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="24" height="24" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'white', marginBottom: '8px' }}>Admin Access</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '32px' }}>TAOS Discovery — Leadership Dashboard</p>
          <form onSubmit={handleAuth}>
            <input type="password" value={code} onChange={e => { setCode(e.target.value); setCodeError('') }}
              placeholder="Access code" autoFocus
              style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: `1px solid ${codeError ? '#FF6B6B' : 'rgba(255,255,255,0.15)'}`, background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: '15px', outline: 'none', fontFamily: 'inherit', textAlign: 'center', letterSpacing: '3px', marginBottom: '12px', boxSizing: 'border-box' }} />
            {codeError && <p style={{ fontSize: '12px', color: '#FF6B6B', marginBottom: '12px' }}>{codeError}</p>}
            <button type="submit" style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: '#00A5A3', color: 'white', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              Enter Dashboard
            </button>
          </form>
          <Link href="/" style={{ display: 'block', marginTop: '20px', fontSize: '12px', color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>Back to main page</Link>
        </div>
      </div>
    )
  }

  /* ═══════════ DASHBOARD ═══════════ */
  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#0D0F10', minHeight: '100vh', color: 'white' }}>

      {/* Nav */}
      <nav style={{ background: '#010103', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 40px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
            <div style={{ background: 'white', borderRadius: '8px', padding: '4px 10px', display: 'flex', alignItems: 'center' }}>
              <img src="/trescon-logo.png" alt="Trescon" style={{ height: '22px', width: 'auto', display: 'block' }} />
            </div>
            <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <div style={{ width: '24px', height: '24px', background: '#00A5A3', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'white' }}>TAOS</span>
            </div>
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Leadership Dashboard</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {loading && <span style={{ fontSize: '11px', color: '#00A5A3' }}>Updating...</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#00A5A3', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Live</span>
          </div>
          <Link href="/insights" style={{ background: 'rgba(192,244,60,0.15)', border: '1px solid rgba(192,244,60,0.3)', color: '#C0F43C', fontSize: '12px', fontWeight: 700, padding: '7px 16px', borderRadius: '20px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            AI Insights
          </Link>
        </div>
      </nav>

      <div style={{ padding: '40px' }}>

        {/* Page header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'white', marginBottom: '4px' }}>Discovery Intelligence</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>
            Every submission is live. Click <strong style={{ color: 'white' }}>AI Insights</strong> above to generate the Gemini analysis across all staff input.
          </p>
        </div>

        {/* ── KPI Row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', marginBottom: '28px' }}>
          {[
            { label: 'Staff Joined', value: totalJoined, sub: `of ${TOTAL} total (${Math.round(totalJoined/TOTAL*100)}%)`, color: '#00A5A3' },
            { label: 'Profiles Complete', value: profilesComplete, sub: `${profilePending} still pending`, color: '#C0F43C' },
            { label: 'Profiles Pending', value: profilePending, sub: 'joined but not interviewed', color: '#FF9F43' },
            { label: 'Interview Entries', value: totalTasks, sub: 'task profile records', color: '#F4ED3C' },
            { label: 'Avg AI Readiness', value: avgReadiness, sub: 'out of 5.0', color: '#FF6B6B' },
          ].map((k, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px 18px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '10px' }}>{k.label}</div>
              <div style={{ fontSize: '34px', fontWeight: 800, color: k.color, lineHeight: 1, marginBottom: '6px' }}>{k.value}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', lineHeight: 1.4 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Two-col: Office + Department breakdown ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '28px' }}>

          {/* Office participation */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '20px' }}>Office Participation</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {OFFICES.map(o => {
                const data = officeMap[o.id]
                const pct  = Math.round((data.count / data.total) * 100)
                return (
                  <div key={o.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'white' }}>{o.label}</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: o.color }}>{data.count} <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>/ {data.total}</span></span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(255,255,255,0.07)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: o.color, borderRadius: '3px', transition: 'width 0.6s' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>{pct}% joined</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Department breakdown */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '20px' }}>Department Participation</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
              {DEPT_ORDER.filter(d => deptMap[d]).map(dept => {
                const data = deptMap[dept]
                return (
                  <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dept}</div>
                    <div style={{ fontSize: '12px', color: 'white', fontWeight: 700, minWidth: '24px', textAlign: 'right' }}>{data.joined}</div>
                    <div style={{ width: '80px', height: '5px', background: 'rgba(255,255,255,0.07)', borderRadius: '3px', overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ height: '100%', width: `${data.complete / data.joined * 100}%`, background: '#C0F43C', borderRadius: '3px' }} />
                    </div>
                    <div style={{ fontSize: '10px', color: data.complete === data.joined ? '#C0F43C' : 'rgba(255,255,255,0.3)', minWidth: '32px', textAlign: 'right' }}>
                      {data.complete}/{data.joined}
                    </div>
                  </div>
                )
              })}
              {allDepts.filter(d => !DEPT_ORDER.includes(d)).map(dept => {
                const data = deptMap[dept]
                return (
                  <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>{dept}</div>
                    <div style={{ fontSize: '12px', color: 'white', fontWeight: 700 }}>{data.joined}</div>
                    <div style={{ width: '80px', height: '5px', background: 'rgba(255,255,255,0.07)', borderRadius: '3px' }}>
                      <div style={{ height: '100%', width: `${data.complete / data.joined * 100}%`, background: '#C0F43C', borderRadius: '3px' }} />
                    </div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{data.complete}/{data.joined}</div>
                  </div>
                )
              })}
              {Object.keys(deptMap).length === 0 && (
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)', paddingTop: '8px' }}>No departments yet</div>
              )}
            </div>
            <div style={{ marginTop: '12px', fontSize: '11px', color: 'rgba(255,255,255,0.25)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
              Green bar = interview also completed
            </div>
          </div>
        </div>

        {/* ── AI Readiness + Top Tools ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '28px' }}>

          {/* Readiness distribution */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '6px' }}>AI Readiness Distribution</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginBottom: '20px' }}>How ready is the team for AI adoption?</div>
            {readinessList.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)' }}>No interview data yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[1, 2, 3, 4, 5].map(n => {
                  const count = readinessDist[n] || 0
                  const pct   = readinessList.length ? Math.round(count / readinessList.length * 100) : 0
                  return (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: `${readinessColors[n-1]}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: readinessColors[n-1] }}>{n}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '3px' }}>{readinessLabels[n]}</div>
                        <div style={{ height: '5px', background: 'rgba(255,255,255,0.07)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: readinessColors[n-1], borderRadius: '3px' }} />
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: readinessColors[n-1], minWidth: '24px', textAlign: 'right' }}>{count}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Top tools */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '6px' }}>Most Used Tools Across Team</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginBottom: '20px' }}>From interview answers — what the team actually uses</div>
            {topTools.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)' }}>No interview data yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {topTools.map(([tool, count], i) => {
                  const pct = Math.round(count / topTools[0][1] * 100)
                  return (
                    <div key={tool} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', minWidth: '16px' }}>#{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '3px' }}>{tool}</div>
                        <div style={{ height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: '#00A5A3', borderRadius: '3px' }} />
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', color: '#00A5A3', fontWeight: 700, minWidth: '20px', textAlign: 'right' }}>{count}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── AI Readiness Leaderboard ── */}
        {(officeScores.length > 0 || topIndividuals.length > 0) && (
          <div style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '16px', height: '2px', background: '#C0F43C', borderRadius: '2px' }} />
              AI Readiness Leaderboard
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>

              {/* Office scores */}
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: '18px' }}>By Office</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {officeScores.map((o, i) => {
                    const { label, color } = scoreLabel(o.avg!)
                    return (
                      <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'rgba(255,255,255,0.2)', minWidth: '16px' }}>#{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: o.color }}>{o.label}</span>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: 'white' }}>{o.avg!.toFixed(1)}<span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>/5</span></span>
                          </div>
                          <div style={{ height: '6px', background: 'rgba(255,255,255,0.07)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(o.avg! / 5) * 100}%`, background: o.color, borderRadius: '3px' }} />
                          </div>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '4px' }}>{o.count} responses · {label}</div>
                        </div>
                      </div>
                    )
                  })}
                  {officeScores.length === 0 && <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)' }}>No data yet</div>}
                </div>
              </div>

              {/* Department scores */}
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: '18px' }}>By Department</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
                  {deptScores.map((d, i) => {
                    const { label, color } = scoreLabel(d.avg)
                    return (
                      <div key={d.dept} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.2)', minWidth: '18px' }}>#{i + 1}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.dept}</span>
                            <span style={{ fontSize: '12px', fontWeight: 800, color, marginLeft: '8px', flexShrink: 0 }}>{d.avg.toFixed(1)}</span>
                          </div>
                          <div style={{ height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(d.avg / 5) * 100}%`, background: color, borderRadius: '3px' }} />
                          </div>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginTop: '3px' }}>{d.count} responses · {label}</div>
                        </div>
                      </div>
                    )
                  })}
                  {deptScores.length === 0 && <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)' }}>No data yet</div>}
                </div>
              </div>

              {/* Top individuals */}
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: '18px' }}>Top AI Champions — Individuals</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {topIndividuals.map((person, i) => {
                    const { label, color } = scoreLabel(person.avg)
                    const off = getOffice(person.office)
                    return (
                      <div key={person.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: i < 3 ? color : 'rgba(255,255,255,0.2)', minWidth: '20px' }}>
                          {i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `#${i + 1}`}
                        </div>
                        <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: `${off?.color ?? '#00A5A3'}20`, border: `1px solid ${off?.color ?? '#00A5A3'}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: off?.color ?? '#00A5A3' }}>{person.name.charAt(0)}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</div>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{off?.label} · {person.dept}</div>
                        </div>
                        <div style={{ textAlign: 'center', flexShrink: 0 }}>
                          <div style={{ fontSize: '16px', fontWeight: 800, color }}>{person.avg.toFixed(1)}</div>
                          <div style={{ fontSize: '9px', color, fontWeight: 700, letterSpacing: '0.5px' }}>{label}</div>
                        </div>
                      </div>
                    )
                  })}
                  {topIndividuals.length === 0 && <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)' }}>No data yet</div>}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'rgba(255,255,255,0.04)', padding: '4px', borderRadius: '12px', width: 'fit-content' }}>
          {([
            ['overview', 'Recent Joins'],
            ['members', 'All Members'],
            ['intelligence', 'Interview Answers'],
          ] as [typeof tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: tab === t ? 'rgba(255,255,255,0.1)' : 'transparent', color: tab === t ? 'white' : 'rgba(255,255,255,0.4)', fontSize: '13px', fontWeight: 700 }}>
              {label}
            </button>
          ))}
        </div>

        {/* Office + Dept filter */}
        {tab !== 'overview' && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {['all', ...OFFICES.map(o => o.id)].map(f => {
              const off = OFFICES.find(o => o.id === f)
              return (
                <button key={f} onClick={() => setOfficeFilter(f)}
                  style={{ padding: '5px 14px', borderRadius: '20px', border: `1px solid ${officeFilter === f ? (off?.color ?? '#00A5A3') : 'rgba(255,255,255,0.12)'}`, background: officeFilter === f ? `${off?.color ?? '#00A5A3'}18` : 'transparent', color: officeFilter === f ? (off?.color ?? '#00A5A3') : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {f === 'all' ? 'All Offices' : off?.label}
                </button>
              )
            })}
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
            {['all', ...allDepts].map(d => (
              <button key={d} onClick={() => setDeptFilter(d)}
                style={{ padding: '5px 14px', borderRadius: '20px', border: `1px solid ${deptFilter === d ? '#00A5A3' : 'rgba(255,255,255,0.08)'}`, background: deptFilter === d ? 'rgba(0,165,163,0.12)' : 'transparent', color: deptFilter === d ? '#00A5A3' : 'rgba(255,255,255,0.35)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {d === 'all' ? 'All Depts' : d}
              </button>
            ))}
          </div>
        )}

        {/* ── Overview tab ── */}
        {tab === 'overview' && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
                Latest Joins — {members.length} total
              </span>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>Green pill = interview also done</span>
            </div>
            {members.slice(0, 15).map((m, i) => {
              const off = getOffice(m.office_id)
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 24px', borderBottom: i < 14 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: `${off?.color ?? '#00A5A3'}20`, border: `1px solid ${off?.color ?? '#00A5A3'}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: off?.color ?? '#00A5A3' }}>{m.name.charAt(0)}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'white' }}>{m.name}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{m.email}</div>
                  </div>
                  <div style={{ fontSize: '12px', color: off?.color ?? '#00A5A3', fontWeight: 700 }}>{off?.label}</div>
                  {m.department && (
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: '6px' }}>{m.department}</div>
                  )}
                  <div style={{ fontSize: '11px', fontWeight: 700, color: m.profile_complete ? '#C0F43C' : 'rgba(255,255,255,0.2)', background: m.profile_complete ? 'rgba(192,244,60,0.12)' : 'transparent', padding: '3px 8px', borderRadius: '6px', border: m.profile_complete ? '1px solid rgba(192,244,60,0.25)' : '1px solid transparent' }}>
                    {m.profile_complete ? 'Interviewed' : 'Not yet'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', minWidth: '80px', textAlign: 'right' }}>
                    {new Date(m.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )
            })}
            {members.length === 0 && (
              <div style={{ padding: '48px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '14px' }}>No staff have joined yet</div>
            )}
          </div>
        )}

        {/* ── Members tab ── */}
        {tab === 'members' && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>{filteredMembers.length} Members</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Name', 'Email', 'Office', 'Department', 'Role', 'Interview', 'Joined'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((m, i) => {
                    const off = getOffice(m.office_id)
                    return (
                      <tr key={m.id} style={{ borderBottom: i < filteredMembers.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'white', whiteSpace: 'nowrap' }}>{m.name}</td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{m.email}</td>
                        <td style={{ padding: '12px 16px' }}><span style={{ fontSize: '12px', fontWeight: 700, color: off?.color ?? '#00A5A3' }}>{off?.label}</span></td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{m.department ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{m.role ?? '—'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: m.profile_complete ? '#C0F43C' : '#FF9F43', background: m.profile_complete ? '#C0F43C15' : '#FF9F4315', border: `1px solid ${m.profile_complete ? '#C0F43C30' : '#FF9F4330'}`, padding: '3px 8px', borderRadius: '6px' }}>
                            {m.profile_complete ? 'Done' : 'Pending'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '11px', color: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>{new Date(m.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                      </tr>
                    )
                  })}
                  {filteredMembers.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '14px' }}>No members for this filter</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Intelligence tab ── */}
        {tab === 'intelligence' && (
          <div>
            <div style={{ background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '14px', padding: '14px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#00A5A3', marginBottom: '3px' }}>These are the actual answers from the TAOS intelligence interview.</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Each entry = one person&apos;s interview response. Click to expand and read the full answer. Use AI Insights to get Gemini&apos;s analysis across all of them.</div>
              </div>
              <Link href="/insights" style={{ background: '#C0F43C', color: '#1E2124', fontSize: '13px', fontWeight: 800, padding: '10px 20px', borderRadius: '10px', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                Generate AI Insights
              </Link>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredTasks.map(t => {
                const member = memberIndex[t.staff_id]
                const off    = member ? getOffice(member.office_id) : null
                const isOpen = expandedTask === t.id
                return (
                  <div key={t.id} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${isOpen ? 'rgba(0,165,163,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: '16px', overflow: 'hidden', transition: 'border-color 0.2s' }}>

                    {/* Header row — always visible */}
                    <button
                      onClick={() => setExpandedTask(isOpen ? null : t.id)}
                      style={{ width: '100%', padding: '16px 20px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '16px', textAlign: 'left' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'white', marginBottom: '4px' }}>{t.task_name}</div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                          {member?.name ?? 'Unknown'} · <span style={{ color: off?.color ?? '#00A5A3' }}>{off?.label}</span> · {member?.department ?? '—'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                        {t.tools_used?.length > 0 && (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {t.tools_used.slice(0, 3).map((tool, j) => (
                              <span key={j} style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: '5px' }}>{tool}</span>
                            ))}
                            {t.tools_used.length > 3 && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>+{t.tools_used.length - 3}</span>}
                          </div>
                        )}
                        {t.ai_readiness && (
                          <div style={{ fontSize: '11px', fontWeight: 700, color: readinessColors[(t.ai_readiness ?? 1) - 1], background: `${readinessColors[(t.ai_readiness ?? 1) - 1]}18`, padding: '3px 8px', borderRadius: '6px' }}>
                            AI: {t.ai_readiness}/5
                          </div>
                        )}
                        <svg width="14" height="14" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </div>
                    </button>

                    {/* Expanded content */}
                    {isOpen && (
                      <div style={{ padding: '0 20px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {t.task_description && (
                          <div style={{ marginTop: '16px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '10px' }}>Interview Answer</div>
                            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '16px', fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                              {t.task_description}
                            </div>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginTop: '16px' }}>
                          {t.tools_used?.length > 0 && (
                            <div>
                              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '6px' }}>Tools Used</div>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {t.tools_used.map((tool, j) => (
                                  <span key={j} style={{ fontSize: '12px', color: '#00A5A3', background: 'rgba(0,165,163,0.12)', border: '1px solid rgba(0,165,163,0.2)', padding: '3px 10px', borderRadius: '6px' }}>{tool}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {t.skill_needed && (
                            <div>
                              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '6px' }}>Skill Needed</div>
                              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{t.skill_needed}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {filteredTasks.length === 0 && (
                <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '48px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '14px' }}>
                  No interview answers yet{officeFilter !== 'all' || deptFilter !== 'all' ? ' for this filter' : ''}.
                </div>
              )}
            </div>
          </div>
        )}

      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  )
}
