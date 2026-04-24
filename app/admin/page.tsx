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

type Member = {
  id: string
  name: string
  email: string
  office_id: string
  department: string | null
  role: string | null
  profile_complete: boolean
  joined_at: string
}

type TaskProfile = {
  id: string
  staff_id: string
  task_name: string
  tools_used: string[]
  time_taken_today: string
  ai_time_estimate: string | null
  skill_needed: string | null
  ai_readiness: number | null
}

type Stats = {
  office_id: string
  count: number
}

export default function AdminPage() {
  const [authed, setAuthed]       = useState(false)
  const [code, setCode]           = useState('')
  const [codeError, setCodeError] = useState('')
  const [members, setMembers]     = useState<Member[]>([])
  const [tasks, setTasks]         = useState<TaskProfile[]>([])
  const [stats, setStats]         = useState<Stats[]>([])
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'tasks'>('overview')
  const [filterOffice, setFilterOffice] = useState('all')
  const [loading, setLoading]     = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: m }, { data: t }] = await Promise.all([
      supabase.from('staff_members').select('*').order('joined_at', { ascending: false }),
      supabase.from('staff_task_profiles').select('*').order('created_at', { ascending: false }),
    ])
    const allMembers = (m ?? []) as Member[]
    setMembers(allMembers)
    setTasks((t ?? []) as TaskProfile[])

    // Aggregate stats
    const agg: Record<string, number> = {}
    for (const mem of allMembers) {
      agg[mem.office_id] = (agg[mem.office_id] ?? 0) + 1
    }
    setStats(Object.entries(agg).map(([office_id, count]) => ({ office_id, count })))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authed) return
    fetchData()

    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_members' }, () => fetchData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_task_profiles' }, () => fetchData())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [authed, fetchData])

  function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    if (code.trim() === (process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026')) {
      setAuthed(true)
    } else {
      setCodeError('Incorrect access code.')
    }
  }

  const totalJoined = members.length
  const profileComplete = members.filter(m => m.profile_complete).length
  const tasksFiled = tasks.length
  const avgReadiness = tasks.length
    ? (tasks.reduce((s, t) => s + (t.ai_readiness ?? 0), 0) / tasks.length).toFixed(1)
    : '—'

  const filteredMembers = filterOffice === 'all'
    ? members
    : members.filter(m => m.office_id === filterOffice)

  const getOfficeCount = (id: string) => stats.find(s => s.office_id === id)?.count ?? 0
  const getOffice = (id: string) => OFFICES.find(o => o.id === id)

  if (!authed) {
    return (
      <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: 'linear-gradient(155deg, #464D53 0%, #010103 60%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '24px', padding: '48px 40px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', background: '#00A5A320', border: '2px solid #00A5A3', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="24" height="24" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'white', marginBottom: '8px' }}>Admin Access</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '32px' }}>Enter your access code to view TAOS discovery data</p>
          <form onSubmit={handleAuth}>
            <input
              type="password"
              value={code}
              onChange={e => { setCode(e.target.value); setCodeError('') }}
              placeholder="Access code"
              style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: `1px solid ${codeError ? '#FF6B6B' : 'rgba(255,255,255,0.15)'}`, background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: '15px', outline: 'none', fontFamily: 'inherit', textAlign: 'center', letterSpacing: '3px', marginBottom: '12px', boxSizing: 'border-box' }}
            />
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

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#0D0F10', minHeight: '100vh', color: 'white' }}>

      {/* Top nav */}
      <nav style={{ background: '#010103', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 40px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <div style={{ width: '28px', height: '28px', background: '#00A5A3', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>TAOS</span>
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '14px' }}>/</span>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Admin Dashboard</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00A5A3' }} />
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Live</span>
          {loading && <span style={{ fontSize: '11px', color: '#00A5A3', marginLeft: '8px' }}>Updating...</span>}
        </div>
      </nav>

      <div style={{ padding: '40px' }}>

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'white', marginBottom: '6px' }}>Discovery Intelligence</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>Real-time view of staff participation across all 4 offices</p>
        </div>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
          {[
            { label: 'Staff Joined', value: totalJoined, sub: `of ${TOTAL} total`, color: '#00A5A3' },
            { label: 'Profiles Complete', value: profileComplete, sub: `of ${totalJoined} joined`, color: '#C0F43C' },
            { label: 'Tasks Mapped', value: tasksFiled, sub: 'work profiles filed', color: '#F4ED3C' },
            { label: 'Avg AI Readiness', value: avgReadiness, sub: 'out of 5.0', color: '#FF6B6B' },
          ].map((k, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '10px' }}>{k.label}</div>
              <div style={{ fontSize: '36px', fontWeight: 800, color: k.color, lineHeight: 1, marginBottom: '6px' }}>{k.value}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Office breakdown */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '28px', marginBottom: '32px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>Office Participation</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
            {OFFICES.map(o => {
              const count = getOfficeCount(o.id)
              const pct = Math.round((count / o.total) * 100)
              return (
                <div key={o.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'white' }}>{o.label}</span>
                    <span style={{ fontSize: '22px', fontWeight: 800, color: o.color }}>{count}</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', marginBottom: '6px' }}>
                    <div style={{ height: '6px', borderRadius: '3px', background: o.color, width: `${pct}%`, transition: 'width 0.6s ease' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{pct}% of {o.total} staff</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'rgba(255,255,255,0.04)', padding: '4px', borderRadius: '12px', width: 'fit-content' }}>
          {(['overview', 'members', 'tasks'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: activeTab === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: activeTab === tab ? 'white' : 'rgba(255,255,255,0.4)',
                fontSize: '13px', fontWeight: 700, textTransform: 'capitalize',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Filter */}
        {(activeTab === 'members' || activeTab === 'tasks') && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {['all', ...OFFICES.map(o => o.id)].map(f => (
              <button
                key={f}
                onClick={() => setFilterOffice(f)}
                style={{
                  padding: '6px 14px', borderRadius: '20px', border: `1px solid ${filterOffice === f ? (getOffice(f)?.color ?? '#00A5A3') : 'rgba(255,255,255,0.15)'}`,
                  background: filterOffice === f ? `${getOffice(f)?.color ?? '#00A5A3'}20` : 'transparent',
                  color: filterOffice === f ? (getOffice(f)?.color ?? '#00A5A3') : 'rgba(255,255,255,0.4)',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                }}
              >
                {f === 'all' ? 'All Offices' : OFFICES.find(o => o.id === f)?.label}
              </button>
            ))}
          </div>
        )}

        {/* Overview tab — latest joins */}
        {activeTab === 'overview' && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
              Latest Joins — {members.length} total
            </div>
            {members.slice(0, 10).map((m, i) => {
              const off = getOffice(m.office_id)
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 24px', borderBottom: i < 9 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: `${off?.color ?? '#00A5A3'}20`, border: `1px solid ${off?.color ?? '#00A5A3'}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: off?.color ?? '#00A5A3' }}>{m.name.charAt(0)}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'white' }}>{m.name}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>{m.email}</div>
                  </div>
                  <div style={{ fontSize: '12px', color: off?.color ?? '#00A5A3', fontWeight: 700 }}>{off?.label}</div>
                  {m.department && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: '6px' }}>{m.department}</div>}
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', minWidth: '90px', textAlign: 'right' }}>{new Date(m.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              )
            })}
            {members.length === 0 && (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '14px' }}>No staff have joined yet</div>
            )}
          </div>
        )}

        {/* Members tab */}
        {activeTab === 'members' && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
                {filteredMembers.length} Members
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Name', 'Email', 'Office', 'Department', 'Role', 'Profile', 'Joined'].map(h => (
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
                        <td style={{ padding: '12px 16px', fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>{m.department ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>{m.role ?? '—'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: m.profile_complete ? '#C0F43C' : 'rgba(255,255,255,0.25)', background: m.profile_complete ? '#C0F43C15' : 'rgba(255,255,255,0.04)', padding: '3px 8px', borderRadius: '6px' }}>
                            {m.profile_complete ? 'Complete' : 'Pending'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '11px', color: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>{new Date(m.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                      </tr>
                    )
                  })}
                  {filteredMembers.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '14px' }}>No members yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tasks tab */}
        {activeTab === 'tasks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {tasks
              .filter(t => filterOffice === 'all' || members.find(m => m.id === t.staff_id)?.office_id === filterOffice)
              .map((t, i) => {
                const member = members.find(m => m.id === t.staff_id)
                const off = member ? getOffice(member.office_id) : null
                return (
                  <div key={t.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px 24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '16px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'white', marginBottom: '4px' }}>{t.task_name}</div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>
                          {member?.name ?? 'Unknown'} · <span style={{ color: off?.color ?? '#00A5A3' }}>{off?.label}</span> · {member?.department ?? ''}
                        </div>
                      </div>
                      {t.ai_readiness && (
                        <div style={{ background: `${off?.color ?? '#00A5A3'}15`, border: `1px solid ${off?.color ?? '#00A5A3'}40`, borderRadius: '10px', padding: '6px 14px', textAlign: 'center', flexShrink: 0 }}>
                          <div style={{ fontSize: '18px', fontWeight: 800, color: off?.color ?? '#00A5A3' }}>{t.ai_readiness}/5</div>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>AI Ready</div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                      {t.time_taken_today && (
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>Today</div>
                          <div style={{ fontSize: '13px', color: '#FF6B6B', fontWeight: 700 }}>{t.time_taken_today}</div>
                        </div>
                      )}
                      {t.ai_time_estimate && (
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>With AI</div>
                          <div style={{ fontSize: '13px', color: '#C0F43C', fontWeight: 700 }}>{t.ai_time_estimate}</div>
                        </div>
                      )}
                      {t.skill_needed && (
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>Skill Needed</div>
                          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{t.skill_needed}</div>
                        </div>
                      )}
                      {t.tools_used?.length > 0 && (
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>Tools Used</div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {t.tools_used.map((tool, j) => (
                              <span key={j} style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '6px' }}>{tool}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            {tasks.length === 0 && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '48px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '14px' }}>
                No task profiles submitted yet
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
