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

  /* ═══════════════════════════════════════════════════════════════════
     TOARS — TAOS Organizational AI Readiness Score  (0–100)

     Built for Trescon's specific context: events + media + B2B sales
     company with 4 offices. Scoring reflects realistic AI adoption
     patterns for this industry, not generic tech company benchmarks.

     Three dimensions:
     ① AI Fluency         (0–40 pts) — self-reported readiness 1–5
     ② Digital Maturity   (0–35 pts) — sophistication of tools used
     ③ Engagement Rate    (0–25 pts) — % of joiners who completed interview

     Tier thresholds (calibrated for events/media industry):
       75–100  AI-Forward     (ready to deploy automations now)
       55–74   AI-Ready       (upskill + deploy in parallel)
       35–54   AI-Aware       (foundation building, 90-day plan)
       15–34   AI-Curious     (awareness + pilot campaigns)
       0–14    AI-Unaware     (start from digital literacy)

     Industry context: Typical events company baseline is 25–40.
     Trescon target: all depts to 60+ within 12 months.
  ═══════════════════════════════════════════════════════════════════ */

  // Tool classification for Trescon's tool stack
  const AI_TOOLS    = new Set(['ChatGPT', 'Claude', 'Gemini', 'Copilot', 'GitHub Copilot',
    'Midjourney', 'DALL-E', 'Notion AI', 'Grammarly', 'Jasper', 'Copy.ai'])
  const MODERN_SAAS = new Set(['HubSpot', 'Salesforce', 'Canva', 'Figma', 'Google Analytics',
    'Looker Studio', 'Data Studio', 'Asana', 'Notion', 'Slack', 'LinkedIn',
    'Meta Ads', 'Google Ads', 'LinkedIn Ads', 'Google Ads', 'Hootsuite',
    'Mailchimp', 'CapCut', 'Premiere Pro', 'Adobe Photoshop', 'Adobe Illustrator',
    'Jira', 'GitHub', 'AWS', 'Google Cloud', 'Trello', 'Xero', 'QuickBooks',
    'Terminal/CLI', 'ATS Software'])

  // Department AI impact priority for Trescon (HIGH = where AI helps most)
  const DEPT_IMPACT: Record<string, { priority: string; color: string; why: string }> = {
    'Events':               { priority: 'Critical', color: '#FF6B6B', why: 'Massive manual coordination overhead — vendor, logistics, reporting' },
    'Sales & Sponsorship':  { priority: 'Critical', color: '#FF6B6B', why: 'Prospecting, proposal writing, follow-ups — all AI-automatable' },
    'Finance':              { priority: 'Critical', color: '#FF6B6B', why: 'Reconciliation, reporting, approval chasing — high automation value' },
    'Marketing':            { priority: 'High',     color: '#FF9F43', why: 'Content creation and campaign analysis — most mature AI tools exist' },
    'DemandifyMedia':       { priority: 'High',     color: '#FF9F43', why: 'Ad optimisation and reporting — AI tools are industry standard now' },
    'HR & Recruitment':     { priority: 'High',     color: '#FF9F43', why: 'CV screening and scheduling are solved problems with AI' },
    'Content & Design':     { priority: 'High',     color: '#FF9F43', why: 'Generative AI for content/design is fastest-moving category' },
    'Leadership':           { priority: 'High',     color: '#FF9F43', why: 'Decision intelligence and real-time visibility gaps' },
    'IT':                   { priority: 'Medium',   color: '#F4ED3C', why: 'Already closest — focus on enabling others, not self-training' },
    'Operations':           { priority: 'Medium',   color: '#F4ED3C', why: 'Process automation needs depends on current tool stack' },
    'Government Relations': { priority: 'Medium',   color: '#F4ED3C', why: 'Document automation + status tracking — achievable in 6 months' },
    'Other':                { priority: 'Medium',   color: '#F4ED3C', why: 'Assess after more data' },
  }

  // TOARS calculation per entity (dept/office/person)
  function calcTOARS(params: {
    readinessScores: number[]   // self-reported 1–5
    allTools: string[]          // all tool mentions (with duplicates)
    interviewed: number         // members who completed interview
    totalJoinedForGroup: number // members who joined
  }) {
    const { readinessScores, allTools, interviewed, totalJoinedForGroup } = params

    // ① AI Fluency (0–40)
    const fluency = readinessScores.length
      ? (readinessScores.reduce((a, b) => a + b, 0) / readinessScores.length / 5) * 40
      : 0

    // ② Digital Maturity (0–35)
    // Ratio of advanced tool usage vs total — avoids rewarding sheer volume
    const aiMentions     = allTools.filter(t => AI_TOOLS.has(t)).length
    const modernMentions = allTools.filter(t => MODERN_SAAS.has(t)).length
    const total          = allTools.length || 1
    const maturityRatio  = (aiMentions * 3 + modernMentions * 1.5) / total
    const maturity       = Math.min(35, maturityRatio * 35 * 3) // scale up (events co. typically < 0.3)

    // ③ Engagement Rate (0–25)
    const engagement = totalJoinedForGroup > 0
      ? (interviewed / totalJoinedForGroup) * 25
      : 0

    const total_score = Math.round(fluency + maturity + engagement)
    return {
      score:    Math.min(100, total_score),
      fluency:  Math.round(fluency),
      maturity: Math.round(maturity),
      engagement: Math.round(engagement),
    }
  }

  // TOARS tier label + color
  function toarsTier(score: number) {
    if (score >= 75) return { label: 'AI-Forward',  color: '#C0F43C', desc: 'Deploy automations now' }
    if (score >= 55) return { label: 'AI-Ready',    color: '#A8E6CF', desc: 'Train + deploy in parallel' }
    if (score >= 35) return { label: 'AI-Aware',    color: '#F4ED3C', desc: '90-day foundation plan' }
    if (score >= 15) return { label: 'AI-Curious',  color: '#FF9F43', desc: 'Awareness + pilot needed' }
    return               { label: 'AI-Unaware',   color: '#FF6B6B', desc: 'Start from literacy basics' }
  }

  // ── Per-department TOARS ──
  type DeptToars = {
    dept: string; score: number; fluency: number; maturity: number; engagement: number
    interviewed: number; joined: number; impact: typeof DEPT_IMPACT[string]
  }
  const deptToarsMap: DeptToars[] = []
  for (const dept of [...new Set(members.map(m => m.department ?? 'Other'))]) {
    const dMembers   = members.filter(m => (m.department ?? 'Other') === dept)
    const dTasks     = tasks.filter(t => (memberIndex[t.staff_id]?.department ?? 'Other') === dept)
    const readScores = dTasks.filter(t => t.ai_readiness).map(t => t.ai_readiness!)
    const allTools   = dTasks.flatMap(t => t.tools_used ?? [])
    const interviewed = dMembers.filter(m => m.profile_complete).length
    const r = calcTOARS({ readinessScores: readScores, allTools, interviewed, totalJoinedForGroup: dMembers.length })
    deptToarsMap.push({ dept, ...r, interviewed, joined: dMembers.length, impact: DEPT_IMPACT[dept] ?? DEPT_IMPACT['Other'] })
  }
  const sortedDeptToars = [...deptToarsMap].sort((a, b) => b.score - a.score)

  // ── Per-office TOARS ──
  const officeToars = OFFICES.map(o => {
    const oMembers   = members.filter(m => m.office_id === o.id)
    const oTasks     = tasks.filter(t => memberIndex[t.staff_id]?.office_id === o.id)
    const readScores = oTasks.filter(t => t.ai_readiness).map(t => t.ai_readiness!)
    const allTools   = oTasks.flatMap(t => t.tools_used ?? [])
    const interviewed = oMembers.filter(m => m.profile_complete).length
    const r = calcTOARS({ readinessScores: readScores, allTools, interviewed, totalJoinedForGroup: oMembers.length })
    return { ...o, ...r, interviewed, joined: oMembers.length }
  }).filter(o => o.joined > 0).sort((a, b) => b.score - a.score)

  // ── Org-level TOARS (weighted by dept size) ──
  let orgScore = 0
  if (deptToarsMap.length > 0) {
    const totalW = deptToarsMap.reduce((s, d) => s + d.joined, 0) || 1
    orgScore = Math.round(deptToarsMap.reduce((s, d) => s + d.score * (d.joined / totalW), 0))
  }
  const orgTier = toarsTier(orgScore)

  // ── Top individual TOARS ──
  const memberToars = Object.fromEntries(
    members.map(m => {
      const mTasks     = tasks.filter(t => t.staff_id === m.id)
      const readScores = mTasks.filter(t => t.ai_readiness).map(t => t.ai_readiness!)
      const allTools   = mTasks.flatMap(t => t.tools_used ?? [])
      const r = calcTOARS({ readinessScores: readScores, allTools, interviewed: m.profile_complete ? 1 : 0, totalJoinedForGroup: 1 })
      return [m.id, r]
    })
  )
  const topIndividuals = members
    .filter(m => m.profile_complete)
    .map(m => ({ ...m, toars: memberToars[m.id]?.score ?? 0 }))
    .sort((a, b) => b.toars - a.toars)
    .slice(0, 8)

  // Legacy compat for existing readiness dist block
  const deptScores = sortedDeptToars.map(d => ({ dept: d.dept, avg: d.fluency / 8, count: d.interviewed }))
  const officeScores = officeToars.map(o => ({ ...o, avg: o.fluency / 8 }))

  /* ── AI-generated response detector ──
     Flags answers that pattern-match AI writing rather than human speech.
     Checks: AI phrases, formal corporate language, excessive structure,
     unnaturally long responses, suspiciously perfect formatting.
     Score 0-100. Above 45 = flagged for review.
  ── */
  function detectAIWriting(text: string): { score: number; flags: string[]; verdict: string } {
    if (!text || text.length < 30) return { score: 0, flags: [], verdict: 'Too short to assess' }
    const flags: string[] = []
    let score = 0
    const lower = text.toLowerCase()

    // Common AI sentence starters and filler phrases
    const aiPhrases = [
      'as a ', 'certainly ', 'i would be happy', 'it is worth noting',
      'furthermore', 'in conclusion', 'to summarize', 'to ensure', 'in order to',
      'this allows me to', 'this enables', 'i leverage', ' utilize ', ' utilise ',
      'actionable insights', 'synergies', 'key stakeholders', 'bandwidth',
      'it is important to note', 'it is crucial', 'it is essential',
      'moving forward', 'going forward', 'at the end of the day',
      'in terms of', 'in the context of', 'with respect to',
    ]
    const phraseHits = aiPhrases.filter(p => lower.includes(p)).length
    if (phraseHits >= 3) { score += 35; flags.push(`AI filler phrases (${phraseHits} found)`) }
    else if (phraseHits >= 2) { score += 20; flags.push('AI language patterns detected') }
    else if (phraseHits === 1) { score += 8 }

    // Formal corporate vocabulary (uncommon in casual interview responses)
    const formalWords = [
      'ensure', 'facilitate', 'leverage', 'optimize', 'implement',
      'streamline', 'stakeholder', 'deliverable', 'actionable',
      'strategic', 'holistic', 'robust', 'scalable', 'seamless',
      'proactive', 'synergy', 'paradigm', 'ecosystem',
    ]
    const formalHits = formalWords.filter(w => lower.includes(w)).length
    if (formalHits >= 4) { score += 25; flags.push(`Formal corporate language (${formalHits} words)`) }
    else if (formalHits >= 2) { score += 12; flags.push('Some formal language') }

    // Unnaturally structured (bullet points, numbered lists)
    const bulletLines  = (text.match(/^[\-•\*\u2022]/gm) || []).length
    const numberedLines = (text.match(/^\d+[\.\)]/gm) || []).length
    if (bulletLines > 3 || numberedLines > 3) { score += 20; flags.push('Over-structured with lists') }
    else if (bulletLines > 1 || numberedLines > 1) { score += 8 }

    // Word count extremes
    const wordCount = text.trim().split(/\s+/).length
    if (wordCount > 300) { score += 25; flags.push(`Very long response (${wordCount} words)`) }
    else if (wordCount > 180) { score += 12; flags.push(`Long response (${wordCount} words)`) }
    else if (wordCount < 8) { score += 5 }

    // Unnaturally long sentences (AI tends toward complex sentence construction)
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().split(/\s+/).length > 3)
    const avgSentLen = sentences.length > 0 ? wordCount / sentences.length : 0
    if (avgSentLen > 28) { score += 15; flags.push('Unnaturally long sentences') }

    // Perfect capitalisation + no informal language (humans make small errors)
    const hasInformal = /\b(gonna|wanna|kinda|sorta|yeah|nope|stuff|things|bit|tons|loads|heaps|super|really|very|just|like,|honestly)\b/i.test(text)
    if (!hasInformal && wordCount > 60) { score += 10; flags.push('No informal language (unusual for interview)') }

    // Verdict
    const final = Math.min(100, score)
    const verdict = final >= 65 ? 'Very likely AI-generated'
      : final >= 45 ? 'Possibly AI-assisted — review'
      : final >= 25 ? 'Some AI patterns — check'
      : 'Appears human-written'

    return { score: final, flags, verdict }
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

        {/* ══ TOARS — Org Score ══ */}
        {members.length > 0 && (
          <div style={{ marginBottom: '28px' }}>

            {/* Org-level score banner */}
            <div style={{ background: orgScore >= 55 ? 'rgba(192,244,60,0.06)' : orgScore >= 35 ? 'rgba(244,237,60,0.06)' : 'rgba(255,107,107,0.06)', border: `1px solid ${orgTier.color}30`, borderRadius: '20px', padding: '28px 32px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center', minWidth: '100px' }}>
                <div style={{ fontSize: '64px', fontWeight: 900, color: orgTier.color, lineHeight: 1, letterSpacing: '-2px' }}>
                  {orgScore > 0 ? orgScore : '—'}
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>/ 100</div>
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '6px' }}>TAOS Organizational AI Readiness Score</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: orgTier.color, marginBottom: '4px' }}>{orgTier.label}</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>{orgTier.desc}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', minWidth: '320px' }}>
                {[
                  { label: 'AI Fluency', sub: 'Self-reported readiness', max: 40, color: '#00A5A3' },
                  { label: 'Digital Maturity', sub: 'Tool sophistication', max: 35, color: '#F4ED3C' },
                  { label: 'Engagement', sub: '% who completed interview', max: 25, color: '#FF9F43' },
                ].map((dim, i) => {
                  const val = i === 0
                    ? (tasks.filter(t => t.ai_readiness).reduce((s, t) => s + (t.ai_readiness ?? 0), 0) / Math.max(tasks.filter(t => t.ai_readiness).length, 1) / 5 * 40)
                    : i === 1
                    ? (() => { const all = tasks.flatMap(t => t.tools_used ?? []); const ai = all.filter(t => AI_TOOLS.has(t)).length; const mod = all.filter(t => MODERN_SAAS.has(t)).length; return Math.min(35, ((ai * 3 + mod * 1.5) / Math.max(all.length, 1)) * 35 * 3) })()
                    : (profilesComplete / Math.max(totalJoined, 1)) * 25
                  return (
                    <div key={dim.label}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: dim.color, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>{dim.label}</div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: 'white' }}>{Math.round(val)}<span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>/{dim.max}</span></div>
                      <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(val / dim.max) * 100}%`, background: dim.color, borderRadius: '3px' }} />
                      </div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '3px' }}>{dim.sub}</div>
                    </div>
                  )
                })}
              </div>
              {orgScore > 0 && (
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '24px', maxWidth: '200px', lineHeight: 1.6 }}>
                  Industry baseline for events companies: <strong style={{ color: 'rgba(255,255,255,0.6)' }}>25–40</strong>.<br/>
                  Trescon 12-month target: <strong style={{ color: '#C0F43C' }}>60+</strong>
                </div>
              )}
            </div>

            {/* Three columns: Office, Dept, Champions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.2fr', gap: '16px' }}>

              {/* Office TOARS */}
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '18px' }}>By Office</div>
                {officeToars.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)' }}>No data yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {officeToars.map((o, i) => {
                      const tier = toarsTier(o.score)
                      return (
                        <div key={o.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '5px' }}>
                            <div>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: o.color }}>{o.label}</span>
                              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginLeft: '6px' }}>{o.interviewed}/{o.joined} interviewed</span>
                            </div>
                            <span style={{ fontSize: '18px', fontWeight: 800, color: tier.color }}>{o.score}</span>
                          </div>
                          <div style={{ height: '6px', background: 'rgba(255,255,255,0.07)', borderRadius: '3px', overflow: 'hidden', marginBottom: '4px' }}>
                            <div style={{ height: '100%', width: `${o.score}%`, background: `linear-gradient(to right, ${o.color}88, ${tier.color})`, borderRadius: '3px' }} />
                          </div>
                          <div style={{ fontSize: '10px', color: tier.color, fontWeight: 700 }}>{tier.label} — {tier.desc}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Department TOARS */}
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '18px' }}>By Department — TOARS Score + Priority</div>
                {sortedDeptToars.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)' }}>No data yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '340px', overflowY: 'auto' }}>
                    {sortedDeptToars.map((d, i) => {
                      const tier   = toarsTier(d.score)
                      const impact = d.impact
                      return (
                        <div key={d.dept} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.2)', minWidth: '16px' }}>#{i+1}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.dept}</span>
                              <span style={{ fontSize: '9px', fontWeight: 800, color: impact.color, background: `${impact.color}18`, padding: '1px 5px', borderRadius: '4px', flexShrink: 0 }}>{impact.priority}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '3px', marginBottom: '4px' }}>
                              {[
                                { val: d.fluency, max: 40, color: '#00A5A3', tip: 'Fluency' },
                                { val: d.maturity, max: 35, color: '#F4ED3C', tip: 'Maturity' },
                                { val: d.engagement, max: 25, color: '#FF9F43', tip: 'Engagement' },
                              ].map(dim => (
                                <div key={dim.tip} style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '2px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${(dim.val / dim.max) * 100}%`, background: dim.color, borderRadius: '2px' }} />
                                </div>
                              ))}
                            </div>
                            <div style={{ fontSize: '10px', color: tier.color }}>{tier.label}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: tier.color, lineHeight: 1 }}>{d.score}</div>
                            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>{d.interviewed}/{d.joined}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div style={{ marginTop: '12px', display: 'flex', gap: '12px', fontSize: '10px', color: 'rgba(255,255,255,0.25)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                  <span style={{ color: '#00A5A3' }}>■ Fluency</span>
                  <span style={{ color: '#F4ED3C' }}>■ Digital Maturity</span>
                  <span style={{ color: '#FF9F43' }}>■ Engagement</span>
                </div>
              </div>

              {/* Top AI Champions */}
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '18px' }}>AI Champions — Top Individuals</div>
                {topIndividuals.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)' }}>No interview data yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {topIndividuals.map((person, i) => {
                      const tier = toarsTier(person.toars)
                      const off  = getOffice(person.office_id)
                      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
                      return (
                        <div key={person.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: i < 3 ? '8px 10px' : '4px 10px', background: i < 3 ? `${tier.color}08` : 'transparent', borderRadius: '10px', border: i < 3 ? `1px solid ${tier.color}20` : '1px solid transparent' }}>
                          <div style={{ fontSize: '13px', minWidth: '20px', textAlign: 'center' }}>
                            {medal ?? <span style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.2)' }}>#{i+1}</span>}
                          </div>
                          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: `${off?.color ?? '#00A5A3'}20`, border: `1px solid ${off?.color ?? '#00A5A3'}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: off?.color ?? '#00A5A3' }}>{person.name.charAt(0)}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</div>
                            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{off?.label} · {person.department ?? '—'}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '16px', fontWeight: 800, color: tier.color, lineHeight: 1 }}>{person.toars}</div>
                            <div style={{ fontSize: '9px', color: tier.color, fontWeight: 700 }}>{tier.label}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
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
                        {t.task_description && (() => {
                          const detection = detectAIWriting(t.task_description)
                          const flagColor = detection.score >= 65 ? '#FF6B6B' : detection.score >= 45 ? '#FF9F43' : detection.score >= 25 ? '#F4ED3C' : '#A8E6CF'
                          return (
                          <div style={{ marginTop: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>Interview Answer</div>
                              {detection.score >= 25 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: `${flagColor}15`, border: `1px solid ${flagColor}40`, borderRadius: '8px', padding: '5px 12px' }}>
                                  <svg width="12" height="12" fill="none" stroke={flagColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                  <span style={{ fontSize: '11px', fontWeight: 700, color: flagColor }}>{detection.verdict}</span>
                                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{detection.score}/100</span>
                                </div>
                              )}
                            </div>
                            {detection.score >= 45 && detection.flags.length > 0 && (
                              <div style={{ background: `${flagColor}10`, border: `1px solid ${flagColor}25`, borderRadius: '8px', padding: '8px 12px', marginBottom: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {detection.flags.map((f, fi) => (
                                  <span key={fi} style={{ fontSize: '10px', color: flagColor, fontWeight: 600 }}>• {f}</span>
                                ))}
                              </div>
                            )}
                            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '16px', fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                              {t.task_description}
                            </div>
                          </div>
                          )
                        })()}
                        {!t.task_description && (
                          <div style={{ marginTop: '16px', fontSize: '13px', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>No answer text recorded</div>
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
