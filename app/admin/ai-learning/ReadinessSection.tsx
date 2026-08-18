'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Member, TaskProfile } from '../page'
import { useReadinessData, airsTier, AI_TOOLS, MODERN_SAAS } from './useReadinessData'
import MemberFilterRow from './MemberFilterRow'

const OFFICES = [
  { id: 'dubai',     label: 'Dubai',     total: 0, color: '#12C9BD' },
  { id: 'bangalore', label: 'Bangalore', total: 0, color: '#A478FF' },
  { id: 'mangalore', label: 'Mangalore', total: 0, color: '#F1667A' },
  { id: 'manipal',   label: 'Manipal',   total: 0, color: '#8882DA' },
]

const DEPT_ORDER = [
  'Events', 'Sales & Sponsorship', 'Marketing', 'Finance', 'Operations',
  'IT', 'HR & Recruitment', 'Content & Design', 'Government Relations',
  'DemandifyMedia', 'Leadership', 'Other',
]

// Tier colors are literal (not vars) — reused as `${tier.color}NN` alpha
// strings; brightened for 4.5:1+ on the dark card background (#142330).
// Same 5 colors are duplicated in airsTier() — kept in sync by value.
const PLAYBOOK_TIERS = [
  { tier: 'AI-Forward',  range: '75–100', color: '#34D399', action: 'Assign as AI Pilot Leads. They run the first automation sprint for their department.', owner: 'AI Lead + Dept Head', by: 'This sprint' },
  { tier: 'AI-Ready',    range: '55–74',  color: '#1296BA', action: 'Pair with an AI-Forward colleague. Start a 30-day tool adoption plan with one specific workflow to automate.', owner: 'Event Pilot Training', by: '30 days' },
  { tier: 'AI-Aware',    range: '35–54',  color: '#F5B94D', action: 'Foundation workshop (half day). Pick one tool for their role and commit to using it daily for 2 weeks.', owner: 'Event Pilot Training + HR', by: '60 days' },
  { tier: 'AI-Curious',  range: '15–34',  color: '#FB923C', action: "Awareness session first — why AI matters for their specific role. Then intro to ChatGPT basics.", owner: 'HR + Event Pilot', by: '90 days' },
  { tier: 'AI-Unaware',  range: '0–14',   color: '#F1667A', action: 'Digital literacy assessment first. Build a personalised catch-up plan before any AI training.', owner: 'HR', by: '120 days' },
]

export default function ReadinessSection({
  members,
  tasks,
  filteredMembers,
  getOffice,
  officeFilter,
  setOfficeFilter,
  deptFilter,
  setDeptFilter,
  memberSearch,
  setMemberSearch,
  interviewFilter,
  setInterviewFilter,
}: {
  members: Member[]
  tasks: TaskProfile[]
  filteredMembers: Member[]
  getOffice: (id: string) => { id: string; label: string; color: string } | undefined
  officeFilter: string
  setOfficeFilter: (v: string) => void
  deptFilter: string
  setDeptFilter: (v: string) => void
  memberSearch: string
  setMemberSearch: (v: string) => void
  interviewFilter: 'all' | 'done' | 'pending'
  setInterviewFilter: (v: 'all' | 'done' | 'pending') => void
}) {
  const [readinessDeptFilter, setReadinessDeptFilter] = useState('all')
  const [deptTierFilter, setDeptTierFilter] = useState('all')
  const [expandedTask, setExpandedTask] = useState<string | null>(null)

  const {
    profilesComplete,
    readinessDist, readinessLabels, readinessColors,
    topTools,
    profileByStaff, memberTairs,
    sortedDeptAirs, officeAirs, officeMap, deptMap,
    topIndividuals,
    assessedAvg, assessedTier, participationPct,
    deptReadinessList,
    detectAIWriting,
  } = useReadinessData(members, tasks, readinessDeptFilter)

  // Group tasks by person so each person gets one row (Intelligence's old per-person table)
  const peopleWithTasks = filteredMembers
    .filter(m => m.profile_complete)
    .map(m => {
      const responses     = profileByStaff[m.id] ?? []
      const readinessTask = responses.find(t => t.ai_readiness != null)
      const aiProofEntry  = responses.find(t => t.ai_proof)
      const allTools      = [...new Set(responses.flatMap(t => t.tools_used ?? []))]
      const score         = memberTairs[m.id]?.score ?? 0
      const tier           = airsTier(score)
      const readiness     = readinessTask?.ai_readiness ?? null
      return { member: m, personTasks: responses, aiProofEntry, allTools, score, tier, readiness }
    })
    .sort((a, b) => b.score - a.score)

  const TIERS = [
    { label: 'AI-Forward', color: '#34D399', range: '75–100', desc: 'Building AI workflows' },
    { label: 'AI-Ready',   color: '#1296BA', range: '55–74',  desc: 'Using AI regularly' },
    { label: 'AI-Aware',   color: '#F5B94D', range: '35–54',  desc: 'Tried it, not a habit' },
    { label: 'AI-Curious', color: '#FB923C', range: '15–34',  desc: 'Knows AI exists' },
    { label: 'AI-Unaware', color: '#F1667A', range: '0–14',   desc: 'Needs foundations first' },
  ]
  const tierCounts: Record<string, number> = Object.fromEntries(TIERS.map(t => [t.label, 0]))
  members.filter(m => m.profile_complete).forEach(m => {
    const score = memberTairs[m.id]?.score ?? 0
    tierCounts[airsTier(score).label] = (tierCounts[airsTier(score).label] ?? 0) + 1
  })
  const tierTotal = profilesComplete || 1

  const TIER_FILTERS = [
    { id: 'all',          label: 'All',          color: '#7E93A1' },
    { id: 'AI-Forward',   label: 'AI-Forward',   color: '#34D399' },
    { id: 'AI-Ready',     label: 'AI-Ready',     color: '#1296BA' },
    { id: 'AI-Aware',     label: 'AI-Aware',     color: '#F5B94D' },
    { id: 'AI-Curious',   label: 'AI-Curious',   color: '#FB923C' },
    { id: 'AI-Unaware',   label: 'AI-Unaware',   color: '#F1667A' },
  ]
  const PRIORITY_FILTERS = [
    { id: 'Critical', color: '#F1667A' },
    { id: 'High',     color: '#F1667A' },
    { id: 'Medium',   color: '#F1667A' },
  ]
  const visibleDepts = sortedDeptAirs.filter(d => {
    if (deptTierFilter === 'all') return true
    const tierMatch = TIER_FILTERS.slice(1).some(f => f.id === deptTierFilter)
    if (tierMatch) return airsTier(d.score).label === deptTierFilter
    return d.impact.priority === deptTierFilter
  })
  const ACTIONS: Record<string, string> = {
    'AI-Forward':  'Assign as AI Pilot Lead — ship first automation',
    'AI-Ready':    'Pair with Forward staff · 30-day workflow plan',
    'AI-Aware':    'Half-day workshop · build one AI habit',
    'AI-Curious':  'Role-specific AI demo · no theory',
    'AI-Unaware':  'Digital literacy first · personal plan via HR',
  }

  return (
    <div>
      {/* ── AI Readiness Score summary card ── */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `4px solid ${assessedAvg > 0 ? assessedTier.color : 'var(--ink3)'}`, borderRadius: '14px', padding: '24px', boxShadow: '0 2px 8px rgba(15,25,35,0.06)', marginBottom: '28px', maxWidth: '420px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>AI Readiness Score</div>
          <Link href="/docs" style={{ fontSize: '11px', color: 'var(--teal-mid)', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            How it works
            <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '6px' }}>
          <span style={{ fontSize: '48px', fontWeight: 900, color: assessedAvg > 0 ? assessedTier.color : 'var(--ink4)', lineHeight: 1 }}>{assessedAvg > 0 ? assessedAvg : '—'}</span>
          {assessedAvg > 0 && (
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: assessedTier.color, lineHeight: 1.2 }}>{assessedTier.label}</div>
              <div style={{ fontSize: '12px', color: 'var(--ink2)', fontWeight: 600, marginTop: '4px' }}>{assessedTier.desc}</div>
            </div>
          )}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--ink3)', fontWeight: 600, marginBottom: '6px' }}>
          {assessedAvg > 0 ? `Avg of ${profilesComplete} assessed · Target 60+ · out of 100` : 'No assessments completed yet'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ flex: 1, height: '5px', background: 'var(--surface)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${participationPct}%`, background: participationPct >= 50 ? 'var(--teal-mid)' : participationPct >= 20 ? '#F5B94D' : 'var(--red)', borderRadius: '3px', transition: 'width 0.6s' }} />
          </div>
          <span style={{ fontSize: '11px', fontWeight: 700, color: participationPct >= 50 ? 'var(--teal-mid)' : participationPct >= 20 ? '#F5B94D' : 'var(--red)', whiteSpace: 'nowrap' }}>{participationPct}% assessed</span>
        </div>
      </div>

      {/* ══ AIRS — Org Score ══ */}
      {members.length > 0 && (
        <div style={{ marginBottom: '28px' }}>

          {/* Tier Summary Strip — who is where right now */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {TIERS.map(t => {
              const count = tierCounts[t.label] ?? 0
              const pct   = Math.round(count / tierTotal * 100)
              return (
                <div key={t.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `4px solid ${t.color}`, borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '6px', boxShadow: '0 2px 8px rgba(15,25,35,0.05)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', color: t.color, textTransform: 'uppercase' }}>{t.range}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '36px', fontWeight: 900, color: count > 0 ? t.color : 'var(--ink4)', lineHeight: 1 }}>{count}</span>
                    {count > 0 && <span style={{ fontSize: '12px', color: 'var(--ink2)', fontWeight: 700 }}>{count === 1 ? 'person' : 'people'}</span>}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: count > 0 ? 'var(--ink)' : 'var(--ink3)' }}>{t.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink3)', lineHeight: 1.4, fontWeight: 600 }}>{t.desc}</div>
                  <div style={{ height: '4px', background: 'var(--surface)', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: t.color, borderRadius: '2px', transition: 'width 0.5s' }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Zone 2: Department Intelligence Table + Office Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

            {/* Left: Department Readiness Table */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
              {/* Header + filters */}
              <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>Department Readiness</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '2px' }}>
                      {visibleDepts.length} of {sortedDeptAirs.length} departments
                      {deptTierFilter !== 'all' && <span style={{ color: 'var(--ink3)' }}> · filtered by <strong style={{ color: 'var(--ink)' }}>{deptTierFilter}</strong></span>}
                    </div>
                  </div>
                </div>
                {/* Tier filter pills */}
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  {TIER_FILTERS.map(f => {
                    const active = deptTierFilter === f.id
                    const count  = f.id === 'all' ? sortedDeptAirs.length : sortedDeptAirs.filter(d => airsTier(d.score).label === f.id).length
                    return (
                      <button key={f.id} onClick={() => setDeptTierFilter(f.id)}
                        style={{ padding: '4px 10px', borderRadius: '16px', border: `1px solid ${active ? f.color : 'var(--border)'}`, background: active ? `${f.color}18` : 'transparent', color: active ? f.color : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}>
                        {f.label}
                        {f.id !== 'all' && count > 0 && <span style={{ fontSize: '9px', opacity: 0.7 }}>{count}</span>}
                      </button>
                    )
                  })}
                  <div style={{ width: '1px', background: 'var(--border)', margin: '0 2px' }} />
                  {PRIORITY_FILTERS.map(f => {
                    const active = deptTierFilter === f.id
                    const count  = sortedDeptAirs.filter(d => d.impact.priority === f.id).length
                    if (count === 0) return null
                    return (
                      <button key={f.id} onClick={() => setDeptTierFilter(f.id)}
                        style={{ padding: '4px 10px', borderRadius: '16px', border: `1px solid ${active ? f.color : 'var(--border)'}`, background: active ? `${f.color}18` : 'transparent', color: active ? f.color : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}>
                        {f.id}
                        <span style={{ fontSize: '9px', opacity: 0.7 }}>{count}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              {visibleDepts.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--ink3)' }}>No departments match this filter</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {visibleDepts.map((d, i) => {
                    const tier        = airsTier(d.score)
                    const impact      = d.impact
                    const completePct = d.joined > 0 ? Math.round(d.interviewed / d.joined * 100) : 0
                    const isTop       = i === 0 && deptTierFilter === 'all'
                    return (
                      <div key={d.dept} style={{
                        borderBottom: i < visibleDepts.length - 1 ? '1px solid var(--surface)' : 'none',
                        background: isTop ? `${tier.color}05` : 'var(--card)',
                        borderLeft: `4px solid ${tier.color}`,
                        padding: '16px 20px',
                      }}>
                        {/* Top row */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                          {/* Score circle */}
                          <div style={{
                            width: '52px', height: '52px', borderRadius: '50%',
                            background: `${tier.color}12`,
                            border: `2px solid ${tier.color}30`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <span style={{ fontSize: '18px', fontWeight: 900, color: tier.color, lineHeight: 1 }}>{d.score}</span>
                          </div>
                          {/* Dept info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                              <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{d.dept}</span>
                              <span style={{ fontSize: '9px', fontWeight: 800, color: tier.color, background: `${tier.color}15`, padding: '2px 8px', borderRadius: '5px', border: `1px solid ${tier.color}25`, whiteSpace: 'nowrap' }}>{tier.label}</span>
                              <span style={{ fontSize: '11px', fontWeight: 800, color: impact.color, background: `${impact.color}12`, padding: '2px 8px', borderRadius: '5px', border: `1px solid ${impact.color}25`, whiteSpace: 'nowrap' }}>{impact.priority} Priority</span>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{d.joined} enrolled · {d.interviewed} assessed</div>
                          </div>
                          {/* Coverage */}
                          <div style={{ flexShrink: 0, textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '4px' }}>Coverage</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                              <div style={{ width: '60px', height: '5px', background: 'var(--surface)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${completePct}%`, background: completePct === 100 ? 'var(--teal-mid)' : tier.color, borderRadius: '3px' }} />
                              </div>
                              <span style={{ fontSize: '13px', fontWeight: 800, color: completePct === 100 ? 'var(--lime)' : 'var(--ink2)' }}>{completePct}%</span>
                            </div>
                          </div>
                        </div>
                        {/* Action row */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', paddingLeft: '64px' }}>
                          <svg width="13" height="13" fill="none" stroke={tier.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '1px' }}><polyline points="9 18 15 12 9 6"/></svg>
                          <span style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.55, fontWeight: 500 }}>{ACTIONS[tier.label] ?? '—'}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Right: Office Cards + AI Champions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Office cards 2x2 grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {OFFICES.map(o => {
                  const oData  = officeAirs.find(x => x.id === o.id)
                  const joined = officeMap[o.id]?.count ?? 0
                  const tier   = oData ? airsTier(oData.score) : null
                  return (
                    <div key={o.id} style={{ background: 'var(--card)', border: `1px solid ${o.color}25`, borderRadius: '16px', padding: '16px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: o.color, flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{o.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '36px', fontWeight: 900, color: o.color, lineHeight: 1 }}>{joined}</span>
                        <span style={{ fontSize: '13px', color: 'var(--ink)', marginLeft: '4px' }}>staff</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{members.filter(m => m.office_id === o.id && m.profile_complete).length} profiles complete</span>
                        {tier && oData && (
                          <span style={{ fontSize: '13px', fontWeight: 800, color: tier.color }}>AIRS {oData.score}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* AI Champions */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '14px' }}>AI Champions</div>
                {topIndividuals.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No interview data yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {topIndividuals.slice(0, 6).map((person, i) => {
                      const tier = airsTier(person.toars)
                      const off  = getOffice(person.office_id)
                      return (
                        <div key={person.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', background: i < 3 ? `${tier.color}08` : 'transparent', borderRadius: '10px', border: i < 3 ? `1px solid ${tier.color}18` : '1px solid transparent' }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', minWidth: '18px' }}>#{i+1}</span>
                          <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: `${off?.color ?? 'var(--teal-mid)'}20`, border: `1px solid ${off?.color ?? 'var(--teal-mid)'}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: off?.color ?? 'var(--teal)' }}>{person.name.charAt(0)}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</div>
                            <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{person.department ?? '—'}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: tier.color, lineHeight: 1 }}>{person.toars}</div>
                            <div style={{ fontSize: '8px', color: tier.color, fontWeight: 700 }}>{tier.label}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── AI Readiness Distribution + Top Tools ── */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginRight: '4px', flexShrink: 0 }}>View by department:</span>
          {['all', ...DEPT_ORDER.filter(d => deptMap[d])].map(d => {
            const active = readinessDeptFilter === d
            const deptData = d !== 'all' ? deptMap[d] : null
            return (
              <button key={d} onClick={() => setReadinessDeptFilter(d)}
                style={{ padding: '4px 12px', borderRadius: '16px', border: `1px solid ${active ? 'var(--teal)' : 'var(--border)'}`, background: active ? 'rgba(0,122,110,0.1)' : 'transparent', color: active ? 'var(--teal)' : 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}>
                {d === 'all' ? 'All Departments' : d}
                {deptData && <span style={{ fontSize: '13px', color: active ? 'var(--teal)' : 'var(--ink2)', fontWeight: 400 }}>({deptData.complete})</span>}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Readiness distribution */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--ink3)' }}>Self-Reported Readiness</div>
              {readinessDeptFilter !== 'all' && (
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)', background: 'rgba(0,165,163,0.12)', border: '1px solid rgba(0,165,163,0.25)', padding: '1px 7px', borderRadius: '10px' }}>{readinessDeptFilter}</div>
              )}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '20px' }}>
              {readinessDeptFilter === 'all' ? 'How staff describe their own AI usage in daily work' : `${deptReadinessList.length} interview${deptReadinessList.length !== 1 ? 's' : ''} from this department`}
            </div>
            {deptReadinessList.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No interview data{readinessDeptFilter !== 'all' ? ' for this department' : ' yet'}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[1, 2, 3, 4, 5].map(n => {
                  const count = readinessDist[n] || 0
                  const pct   = deptReadinessList.length ? Math.round(count / deptReadinessList.length * 100) : 0
                  return (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: `${readinessColors[n-1]}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: readinessColors[n-1] }}>{n}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                          <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{readinessLabels[n]}</span>
                          <span style={{ fontSize: '13px', color: count > 0 ? readinessColors[n-1] : 'var(--ink3)', fontWeight: 700 }}>{pct > 0 ? `${pct}%` : ''}</span>
                        </div>
                        <div style={{ height: '5px', background: 'var(--surface)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: readinessColors[n-1], borderRadius: '3px', transition: 'width 0.4s' }} />
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: count > 0 ? readinessColors[n-1] : 'var(--border)', minWidth: '24px', textAlign: 'right' }}>{count}</div>
                    </div>
                  )
                })}
                <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--ink3)' }}>Avg readiness</span>
                  <span style={{ fontWeight: 800, color: readinessColors[Math.round(deptReadinessList.reduce((a,b)=>a+b,0)/deptReadinessList.length)-1] }}>
                    {(deptReadinessList.reduce((a,b)=>a+b,0)/deptReadinessList.length).toFixed(1)} / 5
                  </span>
                </div>
              </div>
            )}
          </div>
          {/* Top tools */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--ink3)' }}>Top Tools Used</div>
              {readinessDeptFilter !== 'all' && (
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)', background: 'rgba(0,165,163,0.12)', border: '1px solid rgba(0,165,163,0.25)', padding: '1px 7px', borderRadius: '10px' }}>{readinessDeptFilter}</div>
              )}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '20px' }}>
              {readinessDeptFilter === 'all' ? "What the whole team actually uses" : `Tools mentioned by ${readinessDeptFilter} team`}
            </div>
            {topTools.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No interview data{readinessDeptFilter !== 'all' ? ' for this department' : ' yet'}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                {topTools.map(([tool, count], i) => {
                  const pct      = Math.round(count / topTools[0][1] * 100)
                  const isAI     = AI_TOOLS.has(tool)
                  const isSaaS   = MODERN_SAAS.has(tool)
                  const barColor = isAI ? 'var(--lime)' : isSaaS ? 'var(--teal-mid)' : 'var(--ink3)'
                  const tagColor = isAI ? 'var(--lime)' : isSaaS ? 'var(--teal-mid)' : 'var(--ink3)'
                  return (
                    <div key={tool} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', minWidth: '18px' }}>#{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{tool}</span>
                          {isAI && <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--teal)', background: 'rgba(0,122,110,0.1)', padding: '1px 5px', borderRadius: '4px' }}>AI</span>}
                          {isSaaS && !isAI && <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--teal-mid)', background: 'rgba(0,165,163,0.12)', padding: '1px 5px', borderRadius: '4px' }}>SaaS</span>}
                        </div>
                        <div style={{ height: '4px', background: 'var(--surface)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: '3px', transition: 'width 0.4s' }} />
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: tagColor, minWidth: '22px', textAlign: 'right' }}>{count}</div>
                    </div>
                  )
                })}
                <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border)', display: 'flex', gap: '14px', fontSize: '13px' }}>
                  <span style={{ color: 'var(--teal)' }}>■ AI tool</span>
                  <span style={{ color: 'var(--teal-mid)' }}>■ Modern SaaS</span>
                  <span style={{ color: 'var(--ink3)' }}>■ Basic / Other</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Per-person filter row + table (formerly the Intelligence tab) ── */}
      <MemberFilterRow
        members={members}
        filteredCount={filteredMembers.length}
        memberSearch={memberSearch}
        setMemberSearch={setMemberSearch}
        interviewFilter={interviewFilter}
        setInterviewFilter={setInterviewFilter}
        officeFilter={officeFilter}
        setOfficeFilter={setOfficeFilter}
        deptFilter={deptFilter}
        setDeptFilter={setDeptFilter}
        offices={OFFICES}
      />

      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>
          <span style={{ color: 'var(--ink)', fontWeight: 700 }}>{peopleWithTasks.length}</span> assessed · sorted by AI Readiness Score (highest first) · click any row to read full answers
        </div>
        <Link href="/admin/insights" style={{ background: 'var(--teal-mid)', color: 'var(--teal-light)', fontSize: '13px', fontWeight: 700, padding: '8px 18px', borderRadius: '9px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Generate AI Insights
        </Link>
      </div>

      {/* Column headers */}
      {peopleWithTasks.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.6fr 80px 36px', gap: '0', padding: '7px 20px', marginBottom: '4px' }}>
          {['Employee', 'Readiness', 'AI Score', 'Tools used', 'Track', ''].map(h => (
            <div key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{h}</div>
          ))}
        </div>
      )}

      {/* Person rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {peopleWithTasks.map(({ member: m, personTasks, aiProofEntry, allTools, score, tier, readiness }) => {
          const off    = getOffice(m.office_id)
          const isOpen = expandedTask === m.id
          const readinessColor = readiness ? readinessColors[readiness - 1] : 'var(--ink3)'

          return (
            <div key={m.id} style={{ background: isOpen ? 'rgba(0,165,163,0.05)' : 'var(--card)', border: `1px solid ${isOpen ? 'rgba(0,165,163,0.25)' : 'var(--border)'}`, borderRadius: '12px', overflow: 'hidden', transition: 'all 0.15s' }}>

              {/* Row — always visible */}
              <button
                onClick={() => setExpandedTask(isOpen ? null : m.id)}
                style={{ width: '100%', padding: '13px 20px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.6fr 80px 36px', gap: '0', alignItems: 'center', textAlign: 'left' }}
              >
                {/* Col 1: Employee */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, paddingRight: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: `${off?.color ?? 'var(--teal-mid)'}18`, border: `1px solid ${off?.color ?? 'var(--teal-mid)'}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: off?.color ?? 'var(--teal)' }}>{m.name.charAt(0)}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '1px' }}>
                      <span style={{ color: off?.color ?? 'var(--teal)' }}>{off?.label}</span>
                      {m.department ? ` · ${m.department}` : ''}
                    </div>
                  </div>
                </div>

                {/* Col 2: Readiness 1-5 */}
                <div style={{ paddingRight: '12px' }}>
                  {readiness ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: `${readinessColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '13px', fontWeight: 900, color: readinessColor }}>{readiness}</span>
                        </div>
                        <span style={{ fontSize: '9px', color: 'var(--ink3)' }}>/5</span>
                      </div>
                      <div style={{ fontSize: '13px', color: readinessColor, lineHeight: 1.3 }}>{readinessLabels[readiness]}</div>
                    </div>
                  ) : (
                    <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>—</span>
                  )}
                </div>

                {/* Col 3: AIRS individual score */}
                <div style={{ paddingRight: '12px' }}>
                  {score > 0 ? (
                    <div>
                      <span style={{ fontSize: '36px', fontWeight: 900, color: tier.color, lineHeight: 1 }}>{score}</span>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: tier.color, marginTop: '2px' }}>{tier.label}</div>
                    </div>
                  ) : (
                    <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>—</span>
                  )}
                </div>

                {/* Col 4: Top tools */}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', paddingRight: '12px' }}>
                  {allTools.slice(0, 4).map((tool, j) => {
                    const isAI = AI_TOOLS.has(tool)
                    return (
                      <span key={j} style={{ fontSize: '13px', color: isAI ? 'var(--lime)' : 'var(--ink3)', background: isAI ? 'rgba(192,244,60,0.1)' : 'var(--border)', padding: '2px 7px', borderRadius: '5px', whiteSpace: 'nowrap' }}>{tool}</span>
                    )
                  })}
                  {allTools.length > 4 && <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>+{allTools.length - 4}</span>}
                </div>

                {/* Col 5: Track badge */}
                <div>
                  {aiProofEntry?.ai_proof ? (
                    <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--teal)', background: 'rgba(0,122,110,0.1)', border: '1px solid rgba(192,244,60,0.25)', padding: '3px 7px', borderRadius: '5px', whiteSpace: 'nowrap' }}>Advanced</span>
                  ) : (
                    <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--ink3)', background: 'var(--card)', padding: '3px 7px', borderRadius: '5px', whiteSpace: 'nowrap' }}>Standard</span>
                  )}
                </div>

                {/* Col 6: Chevron */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <svg width="14" height="14" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </button>

              {/* Expanded: all their task answers */}
              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {personTasks.map((t, ti) => {
                      const hasContent = t.task_description || t.ai_proof || ((t.tools_used?.length ?? 0) > 0)
                      if (!hasContent) return null
                      const detection = t.task_description ? detectAIWriting(t.task_description) : { score: 0, flags: [], verdict: '' }
                      const flagColor = detection.score >= 65 ? '#F1667A' : detection.score >= 45 ? '#F1667A' : detection.score >= 25 ? '#F1667A' : '#12C9BD'
                      return (
                        <div key={ti} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
                          {/* Task label */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>
                              Entry {ti + 1}{t.task_name ? ` — ${t.task_name}` : ''}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              {t.ai_readiness && (
                                <span style={{ fontSize: '13px', fontWeight: 700, color: readinessColors[t.ai_readiness - 1], background: `${readinessColors[t.ai_readiness - 1]}15`, padding: '2px 8px', borderRadius: '5px', border: `1px solid ${readinessColors[t.ai_readiness - 1]}25` }}>
                                  Readiness {t.ai_readiness}/5
                                </span>
                              )}
                              {detection.score >= 25 && t.task_description && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: `${flagColor}12`, border: `1px solid ${flagColor}35`, borderRadius: '6px', padding: '2px 8px' }}>
                                  <svg width="10" height="10" fill="none" stroke={flagColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                  <span style={{ fontSize: '13px', fontWeight: 700, color: flagColor }}>{detection.verdict}</span>
                                  <span style={{ fontSize: '9px', color: 'var(--ink3)' }}>{detection.score}/100</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Answer text */}
                          {t.task_description && (
                            <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: (t.ai_proof || (t.tools_used?.length ?? 0) > 0) ? '12px' : '0' }}>
                              {t.task_description}
                            </div>
                          )}

                          {/* AI Proof */}
                          {t.ai_proof && (
                            <div style={{ background: 'rgba(192,244,60,0.05)', border: '1px solid rgba(192,244,60,0.18)', borderRadius: '8px', padding: '12px 14px', marginBottom: (t.tools_used?.length ?? 0) > 0 ? '10px' : '0' }}>
                              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: '6px' }}>Advanced Track — Workflow Proof</div>
                              <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{t.ai_proof}</div>
                            </div>
                          )}

                          {/* Tools */}
                          {(t.tools_used?.length ?? 0) > 0 && (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: t.task_description || t.ai_proof ? '10px' : '0' }}>
                              {(t.tools_used ?? []).map((tool, j) => (
                                <span key={j} style={{ fontSize: '13px', color: AI_TOOLS.has(tool) ? 'var(--lime)' : 'var(--teal-mid)', background: AI_TOOLS.has(tool) ? 'rgba(192,244,60,0.1)' : 'rgba(0,165,163,0.12)', border: `1px solid ${AI_TOOLS.has(tool) ? 'rgba(192,244,60,0.2)' : 'rgba(0,165,163,0.2)'}`, padding: '2px 9px', borderRadius: '5px' }}>{tool}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {peopleWithTasks.length === 0 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '48px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>
            No interview data yet{officeFilter !== 'all' || deptFilter !== 'all' ? ' for this filter' : ''}.
          </div>
        )}
      </div>

      {/* Live Department Action Matrix */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', marginBottom: '24px', marginTop: '20px' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '3px' }}>Department Action Matrix — Live</div>
          <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Each department mapped to its current tier and the recommended action to take now. Updates as more staff complete interviews.</div>
        </div>
        {sortedDeptAirs.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', fontSize: '13px', color: 'var(--ink3)' }}>No interview data yet. Seed demo data or wait for staff to complete interviews.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--card)' }}>
                  {['Department', 'AIRS', 'Tier', 'People', 'Coverage', 'AI Priority', 'AI Action', 'Owner', 'By'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--ink3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedDeptAirs.map((d, i) => {
                  const tier    = airsTier(d.score)
                  const play    = PLAYBOOK_TIERS.find(p => p.tier === tier.label) ?? PLAYBOOK_TIERS[4]
                  const impact  = d.impact
                  const covPct  = d.joined > 0 ? Math.round(d.interviewed / d.joined * 100) : 0
                  return (
                    <tr key={d.dept} style={{ borderBottom: i < sortedDeptAirs.length - 1 ? '1px solid var(--surface)' : 'none', background: i === 0 ? `${tier.color}04` : 'transparent' }}>
                      <td style={{ padding: '13px 14px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{d.dept}</div>
                      </td>
                      <td style={{ padding: '13px 14px', textAlign: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: 900, color: tier.color }}>{d.score}</span>
                      </td>
                      <td style={{ padding: '13px 10px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '9px', fontWeight: 800, color: tier.color, background: `${tier.color}15`, padding: '2px 7px', borderRadius: '5px', border: `1px solid ${tier.color}25` }}>{tier.label}</span>
                      </td>
                      <td style={{ padding: '13px 14px', fontSize: '13px', color: 'var(--ink3)', textAlign: 'center' }}>{d.joined}</td>
                      <td style={{ padding: '13px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '44px', height: '4px', background: 'var(--surface)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${covPct}%`, background: covPct === 100 ? 'var(--lime)' : 'var(--teal-mid)', borderRadius: '2px' }} />
                          </div>
                          <span style={{ fontSize: '13px', color: 'var(--ink3)', fontWeight: 700 }}>{covPct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '13px 10px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '9px', fontWeight: 800, color: impact.color, background: `${impact.color}15`, padding: '2px 7px', borderRadius: '5px' }}>{impact.priority}</span>
                      </td>
                      <td style={{ padding: '13px 14px', fontSize: '13px', color: 'var(--ink)', fontWeight: 600, maxWidth: '200px', lineHeight: 1.5 }}>{play.action}</td>
                      <td style={{ padding: '13px 14px', fontSize: '13px', color: tier.color, fontWeight: 700, whiteSpace: 'nowrap' }}>{play.owner}</td>
                      <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: tier.color, background: `${tier.color}18`, border: `1px solid ${tier.color}40`, padding: '3px 8px', borderRadius: '5px' }}>{play.by}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
