/* Shared AIRS computation — single source of truth used by API routes and client pages */

/*
  Score = questionnaire base + course completion bonus

  Questionnaire base (capped at 75):
    1. ai_readiness (1–5 scale)     → 10–65 pts
    2. automation_history (0–4 ord) → 0–15 pts bonus
    3. tool_proficiency (avg 1–4)   → 0–10 pts bonus

  Course bonus (capped at 25 pts):
    foundation = +1.5 pts, adoption = +2.5, advanced = +4

  Total capped at 100
*/

const AUTOMATION_OPTIONS = [
  'No — never tried anything like that',
  "I tried once but it didn't really stick",
  'Yes — I have something simple that works',
  "Yes — I've set up multiple automations",
  'I regularly build automations as part of my work',
]
const AUTOMATION_BONUS = [0, 3, 6, 10, 15]

function questBase(tasks: { ai_readiness?: number; automation_history?: string; tool_proficiency?: Record<string, number> }[]): number {
  if (!tasks.length) return 0

  // 1. ai_readiness base (10–65)
  const avg      = tasks.reduce((s, t) => s + (t.ai_readiness ?? 1), 0) / tasks.length
  const readBase = Math.round(((avg - 1) / 4) * 55 + 10)  // 10–65

  // 2. Automation history bonus (0–15)
  const autoStr  = tasks.find(t => t.automation_history)?.automation_history ?? ''
  const autoIdx  = AUTOMATION_OPTIONS.indexOf(autoStr)
  const autoBonus = autoIdx >= 0 ? AUTOMATION_BONUS[autoIdx] : 0

  // 3. Tool proficiency bonus (0–10)
  const profMap    = tasks.find(t => t.tool_proficiency && Object.keys(t.tool_proficiency ?? {}).length > 0)?.tool_proficiency ?? {}
  const profValues = Object.values(profMap).filter((v): v is number => typeof v === 'number')
  const avgProf    = profValues.length > 0 ? profValues.reduce((s, v) => s + v, 0) / profValues.length : 0
  const profBonus  = avgProf > 0 ? Math.round(((avgProf - 1) / 3) * 10) : 0

  return Math.min(75, readBase + autoBonus + profBonus)
}

export function computeAIRS(
  tasks:        { ai_readiness?: number; automation_history?: string; tool_proficiency?: Record<string, number> }[],
  completions?: { passed: boolean; courses?: { tier_level: string } | null }[],
): number {
  if (!tasks.length) return 0
  const base = questBase(tasks)

  if (!completions?.length) return base

  const bonus = completions
    .filter(c => c.passed)
    .reduce((total, c) => {
      const tier = c.courses?.tier_level
      if (tier === 'advanced')   return total + 4
      if (tier === 'adoption')   return total + 2.5
      if (tier === 'foundation') return total + 1.5
      return total + 1
    }, 0)

  return Math.min(100, Math.round(base + Math.min(25, bonus)))
}

export function getTier(score: number): string {
  if (score >= 75) return 'AI-Forward'
  if (score >= 55) return 'AI-Ready'
  if (score >= 35) return 'AI-Aware'
  if (score >= 15) return 'AI-Curious'
  return 'AI-Unaware'
}

export function getTrack(score: number): 'foundation' | 'adoption' | 'advanced' {
  if (score >= 55) return 'advanced'
  if (score >= 35) return 'adoption'
  return 'foundation'
}

export const TIER_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  'AI-Forward': { color: '#166534', bg: '#16653415', border: '#16653440' },
  'AI-Ready':   { color: '#0E7490', bg: '#0E749015', border: '#0E749040' },
  'AI-Aware':   { color: '#92400E', bg: '#92400E15', border: '#92400E40' },
  'AI-Curious': { color: '#C2410C', bg: '#C2410C15', border: '#C2410C40' },
  'AI-Unaware': { color: '#991B1B', bg: '#991B1B15', border: '#991B1B40' },
}

export const TRACK_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  foundation: { color: '#0E7490', bg: 'rgba(14,116,144,0.12)',  label: 'Foundation' },
  adoption:   { color: '#7C3AED', bg: 'rgba(124,58,237,0.12)', label: 'Adoption'   },
  advanced:   { color: '#166534', bg: 'rgba(22,101,52,0.12)',  label: 'Advanced'   },
}

/* ── Score breakdown (for UI transparency) ────────────────────── */
export type AIRSBreakdown = {
  avg:            number   // raw avg readiness 1–5
  readBase:       number   // pts from ai_readiness only (10–65)
  autoBonus:      number   // pts from automation history (0–15)
  profBonus:      number   // pts from tool proficiency (0–10)
  base:           number   // total questionnaire score (capped 75)
  courseBonus:    number   // raw bonus from courses (uncapped)
  cappedBonus:    number   // capped at 25
  total:          number   // final score
  courseDetails:  { title: string; tier: string; points: number }[]
}

export function breakdownAIRS(
  tasks:        { ai_readiness?: number; automation_history?: string; tool_proficiency?: Record<string, number> }[],
  completions?: { passed: boolean; courses?: { tier_level: string; title?: string } | null }[],
): AIRSBreakdown {
  const empty = { avg: 0, readBase: 0, autoBonus: 0, profBonus: 0, base: 0, courseBonus: 0, cappedBonus: 0, total: 0, courseDetails: [] }
  if (!tasks.length) return empty

  const avg      = tasks.reduce((s, t) => s + (t.ai_readiness ?? 1), 0) / tasks.length
  const readBase = Math.round(((avg - 1) / 4) * 55 + 10)

  const autoStr   = tasks.find(t => t.automation_history)?.automation_history ?? ''
  const autoIdx   = AUTOMATION_OPTIONS.indexOf(autoStr)
  const autoBonus = autoIdx >= 0 ? AUTOMATION_BONUS[autoIdx] : 0

  const profMap    = tasks.find(t => t.tool_proficiency && Object.keys(t.tool_proficiency ?? {}).length > 0)?.tool_proficiency ?? {}
  const profValues = Object.values(profMap).filter((v): v is number => typeof v === 'number')
  const avgProf    = profValues.length > 0 ? profValues.reduce((s, v) => s + v, 0) / profValues.length : 0
  const profBonus  = avgProf > 0 ? Math.round(((avgProf - 1) / 3) * 10) : 0

  const base = Math.min(75, readBase + autoBonus + profBonus)

  const courseDetails: AIRSBreakdown['courseDetails'] = []
  let courseBonus = 0
  if (completions?.length) {
    completions.filter(c => c.passed).forEach(c => {
      const tier = c.courses?.tier_level ?? ''
      let pts = 1
      if (tier === 'advanced')   pts = 4
      if (tier === 'adoption')   pts = 2.5
      if (tier === 'foundation') pts = 1.5
      courseBonus += pts
      courseDetails.push({ title: c.courses?.title ?? 'Course', tier, points: pts })
    })
  }

  const cappedBonus = Math.min(25, courseBonus)
  const total       = Math.min(100, Math.round(base + cappedBonus))
  return {
    avg: Math.round(avg * 10) / 10,
    readBase, autoBonus, profBonus,
    base,
    courseBonus: Math.round(courseBonus * 10) / 10,
    cappedBonus: Math.round(cappedBonus * 10) / 10,
    total,
    courseDetails,
  }
}

/* ── Department-specific AI use cases ────────────────────────── */
export const DEPT_USE_CASES: Record<string, { title: string; desc: string; tool: string }[]> = {
  'Events': [
    { title: 'Run-of-show builder', desc: 'Paste your event brief and ask ChatGPT to generate a minute-by-minute run of show with buffer times.', tool: 'ChatGPT' },
    { title: 'Vendor follow-up emails', desc: 'Give AI the context once — it drafts every follow-up in your voice. Cuts 45 minutes of writing per event.', tool: 'ChatGPT' },
    { title: 'Post-event report', desc: 'Paste your attendance numbers and notes — AI writes the full debrief report in under 2 minutes.', tool: 'ChatGPT' },
    { title: 'Speaker intro scripts', desc: 'Share the speaker bio and session title — AI writes polished 90-second introductions automatically.', tool: 'ChatGPT' },
    { title: 'Delegate FAQ chatbot', desc: 'Build a simple AI bot using Chatbase that answers delegate questions about venue, agenda, and registration.', tool: 'Chatbase' },
  ],
  'Sales & Sponsorship': [
    { title: 'Personalised outreach in seconds', desc: 'Give ChatGPT the company name, their last campaign, and your event — get a sharp first email instantly.', tool: 'ChatGPT' },
    { title: 'Proposal writing', desc: 'Paste the sponsor brief and tell AI the package tiers — it drafts the full proposal deck narrative.', tool: 'ChatGPT' },
    { title: 'CRM data clean-up', desc: 'Export your Salesforce contacts and ask ChatGPT to identify duplicates, missing fields, and scoring gaps.', tool: 'ChatGPT + Salesforce' },
    { title: 'Objection handling prep', desc: 'Ask AI to roleplay as a resistant sponsor CFO so you can practice your response before the real call.', tool: 'ChatGPT' },
    { title: 'LinkedIn prospecting', desc: 'Use LinkedIn + ChatGPT to write personalised connection notes based on each prospect\'s recent activity.', tool: 'LinkedIn + ChatGPT' },
  ],
  'Marketing': [
    { title: 'Campaign brief to 10 content pieces', desc: 'Share one campaign brief — AI generates captions, email subject lines, LinkedIn posts, and ad copy simultaneously.', tool: 'ChatGPT' },
    { title: 'Email A/B subject lines', desc: 'Ask AI to generate 10 subject line variations for any email campaign, with predicted tone and open rate rationale.', tool: 'ChatGPT' },
    { title: 'Competitor analysis', desc: 'Ask Perplexity to research your top 3 competitors\' latest campaigns and summarise positioning gaps.', tool: 'Perplexity' },
    { title: 'Post-campaign analytics narrative', desc: 'Paste your raw metrics — AI turns numbers into an executive summary with insights and next steps.', tool: 'ChatGPT' },
    { title: 'Image generation for social', desc: 'Use DALL-E or Midjourney to create on-brand social media visuals without waiting for the design queue.', tool: 'DALL-E / Midjourney' },
  ],
  'Finance': [
    { title: 'Excel formula builder', desc: 'Describe what you want in plain English — AI writes complex Excel formulas, VLOOKUP chains, and pivot table logic.', tool: 'ChatGPT' },
    { title: 'Expense report analysis', desc: 'Paste a CSV of transactions — AI spots anomalies, flags over-budget lines, and categorises spend instantly.', tool: 'ChatGPT' },
    { title: 'Budget variance commentary', desc: 'Share your actuals vs budget — AI drafts the CFO commentary with explanations for each significant variance.', tool: 'ChatGPT' },
    { title: 'Invoice drafting', desc: 'Give AI the client name, services rendered, and amounts — it generates a professional invoice in any format.', tool: 'ChatGPT' },
    { title: 'Policy Q&A', desc: 'Upload your expense policy PDF to ChatGPT and ask it questions directly — no more digging through documents.', tool: 'ChatGPT' },
  ],
  'Operations': [
    { title: 'SOP documentation', desc: 'Describe a process verbally in a voice note — transcribe it and ask AI to write a formatted SOP with steps.', tool: 'ChatGPT + Whisper' },
    { title: 'Workflow automation with Zapier', desc: 'Connect your email, Trello, and Slack — AI helps you set up automations without writing a single line of code.', tool: 'Zapier + ChatGPT' },
    { title: 'Meeting minutes', desc: 'Record your team meeting, use Otter.ai to transcribe, then ask ChatGPT to extract decisions and actions.', tool: 'Otter.ai + ChatGPT' },
    { title: 'Vendor comparison', desc: 'Paste 3 vendor proposals and ask AI to compare them on price, terms, delivery, and risk in a table.', tool: 'ChatGPT' },
    { title: 'Process gap analysis', desc: 'Describe your current workflow — AI identifies inefficiencies and suggests where automation would save the most time.', tool: 'ChatGPT' },
  ],
  'IT': [
    { title: 'Code review + refactor', desc: 'Paste any code into Claude or ChatGPT and ask for a review — it spots bugs, suggests refactors, and explains issues.', tool: 'Claude / ChatGPT' },
    { title: 'SQL query builder', desc: 'Describe the data you need in plain English — AI writes optimised SQL queries including joins and aggregations.', tool: 'ChatGPT' },
    { title: 'API documentation', desc: 'Paste your endpoints and ask AI to write complete API docs in Markdown, Swagger, or plain English.', tool: 'ChatGPT' },
    { title: 'Incident report drafting', desc: 'Describe a system outage in bullet points — AI writes the full post-mortem report for stakeholders.', tool: 'ChatGPT' },
    { title: 'Bash / Python scripting', desc: 'Ask AI to write automation scripts for repetitive tasks — file processing, API calls, data transforms.', tool: 'Claude / ChatGPT' },
  ],
  'HR & Recruitment': [
    { title: 'Job description writer', desc: 'Give AI the role, level, and department — it writes a complete JD with responsibilities, requirements, and culture hook.', tool: 'ChatGPT' },
    { title: 'CV screening at scale', desc: 'Paste 10 CVs into ChatGPT with your criteria — it shortlists and ranks candidates with reasons in seconds.', tool: 'ChatGPT' },
    { title: 'Interview question generator', desc: 'Share the JD and candidate CV — AI generates role-specific behavioural and competency questions to ask.', tool: 'ChatGPT' },
    { title: 'Offer letter drafting', desc: 'Provide the role details and compensation package — AI writes a professional, legally-worded offer letter.', tool: 'ChatGPT' },
    { title: 'Onboarding checklist builder', desc: 'Share your company structure and new joiner\'s role — AI builds a 30/60/90-day onboarding plan.', tool: 'ChatGPT' },
  ],
  'Content & Design': [
    { title: 'AI image generation', desc: 'Use Midjourney or DALL-E to generate hero images, concept art, or social visuals from text prompts in seconds.', tool: 'Midjourney / DALL-E' },
    { title: 'Caption and copy at scale', desc: 'Share your design brief — AI writes 20 caption variations across tones so you always have options ready.', tool: 'ChatGPT' },
    { title: 'Brand voice consistency check', desc: 'Paste any copy into ChatGPT with your brand guidelines — it flags tone inconsistencies and rewrites them.', tool: 'ChatGPT' },
    { title: 'Video script writing', desc: 'Give AI the topic, audience, and length — it writes a complete video script with a hook, body, and CTA.', tool: 'ChatGPT' },
    { title: 'Design brief to mood board', desc: 'Describe the brief to AI — it generates a text-based mood board with colour palettes, typography, and reference directions.', tool: 'ChatGPT + Midjourney' },
  ],
  'Leadership': [
    { title: 'Board presentation builder', desc: 'Share your key metrics and decisions — AI structures and writes the executive narrative for board-level slides.', tool: 'ChatGPT' },
    { title: 'Strategic options analysis', desc: 'Describe a business decision you\'re facing — AI maps out 4 strategic options with pros, cons, and risk profiles.', tool: 'ChatGPT' },
    { title: 'Team communication drafting', desc: 'AI drafts all-hands emails, policy announcements, and change communications in your voice in seconds.', tool: 'ChatGPT' },
    { title: 'Competitor intelligence', desc: 'Ask Perplexity to research competitor moves — product launches, pricing shifts, and hiring signals.', tool: 'Perplexity' },
    { title: 'Meeting prep briefing', desc: 'Share attendee names and the meeting agenda — AI generates a pre-read briefing with context on each stakeholder.', tool: 'ChatGPT' },
  ],
}
