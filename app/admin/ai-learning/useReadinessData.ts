import { computeAIRS } from '@/app/lib/airs'
import type { Member, TaskProfile } from '../page'

// Kept in sync with app/lib/airs.ts's own scoring by construction (this
// only classifies the score computeAIRS already returned into a tier).
export function airsTier(score: number) {
  if (score >= 75) return { label: 'AI-Forward',  color: '#34D399', desc: 'Deploy automations now' }
  if (score >= 55) return { label: 'AI-Ready',    color: '#1296BA', desc: 'Train + deploy in parallel' }
  if (score >= 35) return { label: 'AI-Aware',    color: '#F5B94D', desc: '90-day foundation plan' }
  if (score >= 15) return { label: 'AI-Curious',  color: '#FB923C', desc: 'Awareness + pilot needed' }
  return               { label: 'AI-Unaware',   color: '#F1667A', desc: 'Start from literacy basics' }
}

// Tool classification for Trescon's tool stack
const AI_TOOLS    = new Set(['ChatGPT', 'Claude', 'Gemini', 'Copilot', 'GitHub Copilot',
  'Midjourney', 'DALL-E', 'Notion AI', 'Grammarly', 'Jasper', 'Copy.ai'])
const MODERN_SAAS = new Set(['HubSpot', 'Salesforce', 'Canva', 'Figma', 'Google Analytics',
  'Looker Studio', 'Data Studio', 'Asana', 'Notion', 'Slack', 'LinkedIn',
  'Meta Ads', 'Google Ads', 'LinkedIn Ads', 'Google Ads', 'Hootsuite',
  'Mailchimp', 'CapCut', 'Premiere Pro', 'Adobe Photoshop', 'Adobe Illustrator',
  'Jira', 'GitHub', 'AWS', 'Google Cloud', 'Trello', 'Xero', 'QuickBooks',
  'Terminal/CLI', 'ATS Software'])
export { AI_TOOLS, MODERN_SAAS }

// Department AI impact priority for Trescon (HIGH = where AI helps most)
// Literal (not vars) — color is reused as `${impact.color}NN` alpha strings.
const DEPT_IMPACT: Record<string, { priority: string; color: string; why: string }> = {
  'Events':               { priority: 'Critical', color: '#F1667A', why: 'Massive manual coordination overhead — vendor, logistics, reporting' },
  'Sales & Sponsorship':  { priority: 'Critical', color: '#F1667A', why: 'Prospecting, proposal writing, follow-ups — all AI-automatable' },
  'Finance':              { priority: 'Critical', color: '#F1667A', why: 'Reconciliation, reporting, approval chasing — high automation value' },
  'Marketing':            { priority: 'High',     color: '#F1667A', why: 'Content creation and campaign analysis — most mature AI tools exist' },
  'DemandifyMedia':       { priority: 'High',     color: '#F1667A', why: 'Ad optimisation and reporting — AI tools are industry standard now' },
  'HR & Recruitment':     { priority: 'High',     color: '#F1667A', why: 'CV screening and scheduling are solved problems with AI' },
  'Content & Design':     { priority: 'High',     color: '#F1667A', why: 'Generative AI for content/design is fastest-moving category' },
  'Leadership':           { priority: 'High',     color: '#F1667A', why: 'Decision intelligence and real-time visibility gaps' },
  'IT':                   { priority: 'Medium',   color: '#F1667A', why: 'Already closest — focus on enabling others, not self-training' },
  'Operations':           { priority: 'Medium',   color: '#F1667A', why: 'Process automation needs depends on current tool stack' },
  'Government Relations': { priority: 'Medium',   color: '#F1667A', why: 'Document automation + status tracking — achievable in 6 months' },
  'Other':                { priority: 'Medium',   color: '#F1667A', why: 'Assess after more data' },
}

type DeptAirs = {
  dept: string; score: number; fluency: number; maturity: number; engagement: number
  interviewed: number; joined: number; impact: typeof DEPT_IMPACT[string]
}

const OFFICES = [
  { id: 'dubai',     label: 'Dubai',     total: 0, color: '#12C9BD' },
  { id: 'bangalore', label: 'Bangalore', total: 0, color: '#A478FF' },
  { id: 'mangalore', label: 'Mangalore', total: 0, color: '#F1667A' },
  { id: 'manipal',   label: 'Manipal',   total: 0, color: '#8882DA' },
]

/*
  All AIRS (AI Readiness Score) derived data in one place — moved verbatim
  out of app/admin/page.tsx's Overview/Intelligence tabs (2026-08-18
  consolidation). Recomputes from members/tasks (still top-level/shared
  state in page.tsx, used by other tabs too) plus this section's own
  readinessDeptFilter, which only Readiness needs.
*/
export function useReadinessData(members: Member[], tasks: TaskProfile[], readinessDeptFilter: string) {
  const totalJoined      = members.length
  const profilesComplete = members.filter(m => m.profile_complete).length

  const memberIndex = Object.fromEntries(members.map(m => [m.id, m]))

  // Tasks filtered by the readiness/tools dept selector (separate from the tab-level filters)
  const rdFilteredTasks = readinessDeptFilter === 'all'
    ? tasks
    : tasks.filter(t => (memberIndex[t.staff_id]?.department ?? 'Other') === readinessDeptFilter)
  const deptReadinessList = rdFilteredTasks.flatMap(t => t.responses ?? []).filter(r => r.ai_readiness).map(r => r.ai_readiness!)

  /* ── AI Readiness breakdown (filtered by readinessDeptFilter) ── */
  const readinessDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of deptReadinessList) { if (r >= 1 && r <= 5) readinessDist[r]++ }
  const readinessLabels: Record<number, string> = {
    1: 'Never used AI',
    2: 'Tried it once or twice',
    3: 'Use AI occasionally',
    4: 'Use AI most days',
    5: 'Build AI workflows',
  }
  // Literal (not vars) — indexed and reused as `${readinessColors[n]}NN` alpha strings.
  const readinessColors = ['#F1667A', '#F1667A', '#F1667A', '#12C9BD', '#C0F43C']

  /* ── Most common tools (filtered by readinessDeptFilter) ── */
  const toolCount: Record<string, number> = {}
  for (const t of rdFilteredTasks) for (const r of (t.responses ?? [])) for (const tool of (r.tools_used ?? [])) toolCount[tool] = (toolCount[tool] ?? 0) + 1
  const topTools = Object.entries(toolCount).sort((a, b) => b[1] - a[1]).slice(0, 10)

  // ── Individual AIRS scores using shared computeAIRS (single source of truth) ──
  // tasks[] is [{ staff_id, responses[] }] — responses contains ai_readiness, automation_history, tool_proficiency
  const profileByStaff = Object.fromEntries(tasks.map(t => [t.staff_id, t.responses ?? []]))

  const memberTairs = Object.fromEntries(
    members.map(m => {
      const responses = profileByStaff[m.id] ?? []
      const score = responses.length > 0 ? computeAIRS(responses) : 0
      return [m.id, { score }]
    })
  )

  // ── Per-department AIRS (average of individual scores, weighted by assessed members) ──
  const deptAirsMap: DeptAirs[] = []
  for (const dept of [...new Set(members.map(m => m.department ?? 'Other'))]) {
    const dMembers    = members.filter(m => (m.department ?? 'Other') === dept)
    const interviewed = dMembers.filter(m => m.profile_complete).length
    const dScores     = dMembers.filter(m => m.profile_complete).map(m => memberTairs[m.id]?.score ?? 0)
    const score       = dScores.length > 0 ? Math.round(dScores.reduce((a, b) => a + b, 0) / dScores.length) : 0
    // keep fluency/maturity/engagement for legacy UI slots — derive from score
    deptAirsMap.push({ dept, score, fluency: score, maturity: 0, engagement: 0, interviewed, joined: dMembers.length, impact: DEPT_IMPACT[dept] ?? DEPT_IMPACT['Other'] })
  }
  const sortedDeptAirs = [...deptAirsMap].sort((a, b) => b.score - a.score)

  // ── Per-office AIRS ──
  const officeAirs = OFFICES.map(o => {
    const oMembers    = members.filter(m => m.office_id === o.id)
    const interviewed = oMembers.filter(m => m.profile_complete).length
    const oScores     = oMembers.filter(m => m.profile_complete).map(m => memberTairs[m.id]?.score ?? 0)
    const score       = oScores.length > 0 ? Math.round(oScores.reduce((a, b) => a + b, 0) / oScores.length) : 0
    return { ...o, score, fluency: score, maturity: 0, engagement: 0, interviewed, joined: oMembers.length }
  }).filter(o => o.joined > 0).sort((a, b) => b.score - a.score)

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

  const allAssessedScores = members.filter(m => m.profile_complete).map(m => memberTairs[m.id]?.score ?? 0)

  const topIndividuals = members
    .filter(m => m.profile_complete)
    .map(m => ({ ...m, toars: memberTairs[m.id]?.score ?? 0 }))
    .sort((a, b) => b.toars - a.toars)
    .slice(0, 8)

  // ── Assessed-only avg score ──
  const assessedScores  = allAssessedScores.filter(s => s > 0)
  const assessedAvg     = assessedScores.length > 0 ? Math.round(assessedScores.reduce((a, b) => a + b, 0) / assessedScores.length) : 0
  const assessedTier    = airsTier(assessedAvg)
  const participationPct = totalJoined > 0 ? Math.round(profilesComplete / totalJoined * 100) : 0

  return {
    profilesComplete,
    readinessDist, readinessLabels, readinessColors,
    toolCount, topTools,
    profileByStaff, memberTairs,
    deptAirsMap, sortedDeptAirs, officeAirs, officeMap, deptMap,
    topIndividuals,
    assessedAvg, assessedTier, participationPct,
    deptReadinessList,
    detectAIWriting,
  }
}

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
  const bulletLines  = (text.match(/^[\-•\*•]/gm) || []).length
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
