'use client'

import { useState, useRef, useEffect } from 'react'
import { submitProfile } from '@/app/actions/profile'
import Link from 'next/link'

/* ─── Types ───────────────────────────────────────────────────── */
type QType = 'textarea' | 'chips' | 'scale' | 'select' | 'text'
type Question = {
  id: string
  question: string
  subtext?: string
  type: QType
  options?: string[]
  placeholder?: string
}

/* ─── Department tool chips ──────────────────────────────────── */
const DEPT_TOOLS: Record<string, string[]> = {
  'Events': ['Excel', 'Word', 'WhatsApp', 'Email', 'Zoom', 'Google Sheets', 'Trello', 'Asana', 'PowerPoint', 'Salesforce', 'Other'],
  'Sales & Sponsorship': ['Salesforce', 'HubSpot', 'Excel', 'PowerPoint', 'LinkedIn', 'WhatsApp', 'Email', 'Zoom', 'Google Sheets', 'Other'],
  'Marketing': ['Canva', 'Mailchimp', 'Instagram', 'LinkedIn', 'Google Analytics', 'HubSpot', 'Excel', 'PowerPoint', 'Hootsuite', 'Meta Ads', 'Other'],
  'Finance': ['Excel', 'QuickBooks', 'Xero', 'SAP', 'Tally', 'Email', 'WhatsApp', 'Word', 'Other'],
  'Operations': ['Excel', 'Google Sheets', 'Trello', 'Asana', 'WhatsApp', 'Email', 'Zoom', 'Word', 'Other'],
  'IT': ['GitHub', 'Jira', 'Slack', 'Zoom', 'Excel', 'Terminal/CLI', 'AWS', 'Google Cloud', 'Notion', 'Other'],
  'HR & Recruitment': ['Excel', 'LinkedIn', 'WhatsApp', 'Email', 'Zoom', 'Google Sheets', 'Word', 'ATS Software', 'Other'],
  'Content & Design': ['Canva', 'Adobe Photoshop', 'Adobe Illustrator', 'Figma', 'Word', 'PowerPoint', 'CapCut', 'Premiere Pro', 'ChatGPT', 'Other'],
  'Government Relations': ['Word', 'Email', 'WhatsApp', 'Excel', 'PDF Tools', 'Government Portals', 'Other'],
  'DemandifyMedia': ['Meta Ads', 'Google Ads', 'LinkedIn Ads', 'Canva', 'HubSpot', 'Google Analytics', 'Excel', 'Looker Studio', 'Other'],
  'Leadership': ['Excel', 'PowerPoint', 'Email', 'WhatsApp', 'Zoom', 'Salesforce', 'Notion', 'Other'],
}
const DEFAULT_TOOLS = ['Excel', 'Email', 'WhatsApp', 'Zoom', 'Word', 'Google Sheets', 'Other']

/* ─── Department-specific questions ─────────────────────────── */
const DEPT_QUESTIONS: Record<string, Question[]> = {
  'Events': [
    {
      id: 'events_cycle',
      question: 'Walk us through your last event — from brief to execution. Where did it break down?',
      subtext: 'Think: vendor delays, last-minute changes, communication gaps, what kept you up the night before.',
      type: 'textarea',
      placeholder: 'Usually the week before is chaos because vendors confirm late, and then the AV team shows up without the right setup...',
    },
    {
      id: 'events_followups',
      question: 'How many vendor and client follow-ups do you handle per event?',
      type: 'select',
      options: ['Under 20', '20–50', '50–100', '100–200', 'More than 200'],
    },
    {
      id: 'events_manual',
      question: 'What takes the most manual effort in your event process?',
      type: 'chips',
      options: ['Venue & logistics coordination', 'Speaker and delegate management', 'Vendor follow-ups', 'Budget tracking', 'Post-event reporting', 'Marketing collateral', 'Run-of-show updates'],
    },
  ],
  'Sales & Sponsorship': [
    {
      id: 'sales_pipeline',
      question: 'Walk us through how a deal moves from first contact to close. Where does time get lost?',
      type: 'textarea',
      placeholder: 'First I find them on LinkedIn, send an email, then a deck goes out — and that\'s usually where it stalls for 2 weeks...',
    },
    {
      id: 'sales_bottleneck',
      question: 'What\'s your biggest bottleneck in closing deals?',
      type: 'chips',
      options: ['Getting the first meeting', 'Writing proposals', 'Following up multiple times', 'Internal approvals', 'Prospect ghosting', 'CRM / pipeline tracking', 'Deck customisation per client'],
    },
    {
      id: 'sales_volume',
      question: 'How many active prospects or sponsors are you managing right now?',
      type: 'select',
      options: ['Under 10', '10–25', '25–50', '50–100', 'Over 100'],
    },
  ],
  'Marketing': [
    {
      id: 'mktg_output',
      question: 'What\'s your content pipeline like — and where does it actually stall?',
      subtext: 'Think about briefs, approvals, design, copy, publishing. Where is the real bottleneck?',
      type: 'textarea',
      placeholder: 'I write the brief but design takes 4 days, then approval takes another 2. By the time it goes live the moment has passed...',
    },
    {
      id: 'mktg_channels',
      question: 'Which channels or campaigns are you primarily responsible for?',
      type: 'chips',
      options: ['Social Media', 'Email Campaigns', 'Event Marketing', 'Paid Ads', 'Content / Blog', 'PR & Media', 'Influencer', 'LinkedIn B2B', 'WhatsApp Broadcast'],
    },
    {
      id: 'mktg_measurement',
      question: 'How do you currently measure what\'s working?',
      type: 'select',
      options: ['Platform analytics (manually)', 'Weekly reports I build myself', 'HubSpot/CRM tracking', 'No structured measurement', 'My manager tracks it'],
    },
  ],
  'Finance': [
    {
      id: 'finance_cycle',
      question: 'Walk us through your financial cycle — invoices, reconciliation, reporting. Where does it drag?',
      type: 'textarea',
      placeholder: 'Month-end is the worst. I\'m chasing approvals from 6 departments while trying to reconcile in Excel...',
    },
    {
      id: 'finance_reports',
      question: 'Which reports take you the most time to build each month?',
      type: 'chips',
      options: ['P&L reports', 'Budget vs actuals', 'Cash flow', 'Vendor payments', 'Tax filings', 'Payroll', 'Event-wise cost tracking', 'Expense approvals'],
    },
    {
      id: 'finance_chase',
      question: 'How much time do you spend chasing approvals, receipts, or documents?',
      type: 'select',
      options: ['Less than 1 hour/week', '1–3 hours/week', '3–6 hours/week', 'About half my week', 'Most of my time honestly'],
    },
  ],
  'Operations': [
    {
      id: 'ops_processes',
      question: 'Which end-to-end processes are you responsible for? Where do they break down?',
      type: 'textarea',
      placeholder: 'I manage vendor contracts and logistics — it usually breaks at the handoff between departments where no one owns the next step...',
    },
    {
      id: 'ops_coordination',
      question: 'What creates the most coordination overhead in your role?',
      type: 'chips',
      options: ['Following up on tasks across teams', 'Getting approvals', 'Tracking who is doing what', 'Managing vendors', 'Sending status updates', 'Last-minute changes'],
    },
    {
      id: 'ops_tracking',
      question: 'How do you currently track tasks and deadlines?',
      type: 'select',
      options: ['WhatsApp groups', 'Excel tracker', 'Trello / Asana / Notion', 'Email threads', 'Verbal / memory', 'Multiple tools — it\'s messy'],
    },
  ],
  'IT': [
    {
      id: 'it_split',
      question: 'What percentage of your week is reactive (fixing issues) vs. proactive (building or improving)?',
      type: 'select',
      options: ['80%+ reactive', '60–80% reactive', 'Roughly 50/50', '60–80% proactive', 'Mostly proactive'],
    },
    {
      id: 'it_requests',
      question: 'What types of requests eat the most of your time?',
      type: 'chips',
      options: ['Access & permissions', 'Hardware setup', 'Software installs', 'Network issues', 'System integrations', 'Data requests', 'Security incidents', 'User training', 'Reports & dashboards'],
    },
    {
      id: 'it_systems',
      question: 'What systems and infrastructure are you managing day to day?',
      type: 'textarea',
      placeholder: 'We have our event management system, email server, Salesforce, and I\'m also the one managing the website and network...',
    },
  ],
  'HR & Recruitment': [
    {
      id: 'hr_recruitment',
      question: 'Walk us through how you hire someone — from JD to offer letter. Where does it slow down?',
      type: 'textarea',
      placeholder: 'We post on LinkedIn, get 200 CVs, screening takes 3 days, then interviews get rescheduled 3 times and we lose the candidate...',
    },
    {
      id: 'hr_volume',
      question: 'How many open roles are you managing simultaneously right now?',
      type: 'select',
      options: ['1–3', '4–8', '9–15', '15–25', 'Over 25'],
    },
    {
      id: 'hr_pain',
      question: 'What are the biggest time drains in your HR work?',
      type: 'chips',
      options: ['CV screening', 'Interview scheduling', 'Offer letter paperwork', 'Onboarding documentation', 'Tracking candidate status', 'Internal approvals', 'Performance reviews', 'Policy compliance'],
    },
  ],
  'Content & Design': [
    {
      id: 'design_output',
      question: 'How much content or design work do you produce per week — and where is the real bottleneck?',
      type: 'textarea',
      placeholder: 'Around 10–15 social posts, 2–3 event decks, but approval kills me. I spend more time waiting for feedback than designing...',
    },
    {
      id: 'design_revisions',
      question: 'How many rounds of revisions is typical for your work?',
      type: 'select',
      options: ['Usually just 1', '2–3 rounds', '4–5 rounds', '6+ rounds', 'No process — it keeps coming back forever'],
    },
    {
      id: 'design_blocks',
      question: 'What creates the most friction in your creative process?',
      type: 'chips',
      options: ['Vague or late briefs', 'Feedback that contradicts itself', 'Too many stakeholders', 'Missing brand assets', 'Last-minute rush requests', 'No structured brief or approval flow'],
    },
  ],
  'Government Relations': [
    {
      id: 'govrel_docs',
      question: 'What permits, approvals, or government filings do you manage? Walk us through the process.',
      type: 'textarea',
      placeholder: 'We handle event permits, trade licenses, ministry approvals. The issue is always following up with departments who take 3 weeks to respond...',
    },
    {
      id: 'govrel_delays',
      question: 'What causes the most delays in your approval process?',
      type: 'chips',
      options: ['Missing documents at submission', 'Government portal issues', 'Long queues', 'Wrong formats submitted', 'Internal sign-off delays', 'Changing requirements', 'Language or translation issues'],
    },
    {
      id: 'govrel_tracking',
      question: 'How do you currently track open applications and permit status?',
      type: 'select',
      options: ['Excel tracker', 'Email threads', 'WhatsApp', 'Government portals only', 'No centralised tracking'],
    },
  ],
  'DemandifyMedia': [
    {
      id: 'demand_campaigns',
      question: 'Walk us through a campaign from brief to live. Where does the breakdown usually happen?',
      type: 'textarea',
      placeholder: 'Client sends a brief, we build the campaign, but creative approvals take days and we miss the optimal launch window...',
    },
    {
      id: 'demand_channels',
      question: 'Which platforms and formats do you primarily run?',
      type: 'chips',
      options: ['Meta (Facebook/Instagram) Ads', 'Google Search Ads', 'Google Display', 'LinkedIn Ads', 'YouTube Ads', 'Email Marketing', 'WhatsApp Campaigns', 'Influencer', 'SEO/Content'],
    },
    {
      id: 'demand_reporting',
      question: 'How do you currently report performance to clients?',
      type: 'select',
      options: ['Manual Excel reports', 'Platform screenshots', 'Automated dashboard (Looker/Data Studio)', 'Ad hoc when client asks', 'Monthly PPT decks'],
    },
  ],
  'Leadership': [
    {
      id: 'lead_week',
      question: 'How does your actual week break down? Where is your time going that shouldn\'t need your attention?',
      type: 'textarea',
      placeholder: 'Mondays are all-hands, then I\'m in approvals and follow-ups most of the week. I can rarely think strategically during working hours...',
    },
    {
      id: 'lead_decisions',
      question: 'What decisions take the longest because of missing or delayed information?',
      type: 'textarea',
      placeholder: 'Hiring decisions are slow because I don\'t have pipeline visibility. Revenue decisions wait on Finance. KPI updates come too late...',
    },
    {
      id: 'lead_visibility',
      question: 'What do you wish you could see in real-time across the business?',
      type: 'chips',
      options: ['Revenue & pipeline', 'Staff output & capacity', 'Event P&L at a glance', 'Vendor performance', 'Team workload', 'Customer/client health', 'Department KPIs', 'Approval bottlenecks'],
    },
  ],
  'Other': [
    {
      id: 'other_core',
      question: 'Walk us through your core responsibilities — what does the work actually look like day to day?',
      type: 'textarea',
      placeholder: 'My main responsibilities are... and most of my time goes to...',
    },
    {
      id: 'other_bottleneck',
      question: 'What\'s the single biggest inefficiency in how your work gets done today?',
      type: 'textarea',
      placeholder: 'The thing that slows everything down is...',
    },
  ],
}

/* ─── Core questions (everyone gets these) ───────────────────── */
const CORE_QUESTIONS: Question[] = [
  {
    id: 'daily_work',
    question: 'Give us a real picture of your week. What does a typical working day actually look like for you?',
    subtext: 'Not the job description — tell us what really happens from morning to end of day.',
    type: 'textarea',
    placeholder: 'I usually start by checking emails and WhatsApp messages from the night before. Then I have...',
  },
  {
    id: 'time_drain',
    question: 'What\'s the single task that eats the most time but probably shouldn\'t?',
    subtext: 'The thing you\'re doing manually that a smarter system should handle.',
    type: 'textarea',
    placeholder: 'Every week I spend hours doing...',
  },
  {
    id: 'tools',
    question: 'Which tools do you actually use every day to get work done?',
    subtext: 'Select everything you touch regularly. Be honest — even the unofficial ones.',
    type: 'chips',
    options: [],
  },
  {
    id: 'stuck',
    question: 'When your work gets stuck or delayed — what\'s usually the real cause?',
    type: 'select',
    options: [
      'Waiting for approvals from leadership',
      'Chasing people for information or documents',
      'Manual data entry and reporting',
      'Too many meetings cutting into work time',
      'Communication gaps between teams',
      'No clear process or ownership',
      'Tools that don\'t talk to each other',
    ],
  },
  {
    id: 'ai_wish',
    question: 'If TAOS could automate one part of your workflow from tomorrow — what would it be?',
    subtext: 'This answer directly shapes what gets built first for your department.',
    type: 'textarea',
    placeholder: 'I\'d want it to automatically...',
  },
  {
    id: 'ai_readiness',
    question: 'Where are you with AI tools right now — honestly?',
    subtext: 'No right or wrong. We need to know where everyone is to build the right training.',
    type: 'scale',
    options: [
      'Never used AI tools at all',
      'Tried ChatGPT a couple of times',
      'Use AI occasionally for specific tasks',
      'Comfortable with multiple AI tools',
      'Building workflows and prompts with AI',
    ],
  },
]

/* ─── Build question list for this department ────────────────── */
function buildQuestions(department: string): Question[] {
  const tools = DEPT_TOOLS[department] ?? DEFAULT_TOOLS
  const deptQs = DEPT_QUESTIONS[department] ?? DEPT_QUESTIONS['Other']

  const qs = CORE_QUESTIONS.map(q =>
    q.id === 'tools' ? { ...q, options: tools } : q
  )

  // Insert dept questions after time_drain (index 1), before tools (index 2)
  return [...qs.slice(0, 2), ...deptQs, ...qs.slice(2)]
}

/* ─── Map answers → task profile entries for Supabase ───────── */
function buildTaskEntries(
  answers: Record<string, string | string[] | number>,
  department: string,
  staffId: string,
) {
  const str = (v: unknown) => (Array.isArray(v) ? (v as string[]).join(', ') : String(v ?? ''))

  const deptQs = DEPT_QUESTIONS[department] ?? DEPT_QUESTIONS['Other']
  const deptAnswers = deptQs
    .filter(q => answers[q.id] !== undefined && answers[q.id] !== '')
    .map(q => `${q.question}\n→ ${str(answers[q.id])}`)
    .join('\n\n')

  const tools = Array.isArray(answers['tools'])
    ? (answers['tools'] as string[])
    : answers['tools']
    ? [str(answers['tools'])]
    : []

  const readiness = typeof answers['ai_readiness'] === 'number'
    ? (answers['ai_readiness'] as number)
    : 3

  return [
    {
      staff_id:         staffId,
      task_name:        'Daily Workflow & Work Pattern',
      task_description: [
        answers['daily_work'] ? `What a typical day looks like:\n${str(answers['daily_work'])}` : '',
        deptAnswers ? `Department-specific context:\n${deptAnswers}` : '',
      ].filter(Boolean).join('\n\n'),
      tools_used:       tools,
      frequency:        'Daily',
      ai_readiness:     readiness,
    },
    {
      staff_id:         staffId,
      task_name:        'Key Pain Points & Time Drains',
      task_description: [
        answers['time_drain'] ? `Biggest time drain:\n${str(answers['time_drain'])}` : '',
        answers['stuck'] ? `Main cause of delays: ${str(answers['stuck'])}` : '',
      ].filter(Boolean).join('\n\n'),
      frequency:        'Daily',
      ai_readiness:     readiness,
    },
    {
      staff_id:         staffId,
      task_name:        'AI Opportunity & Automation Wish',
      task_description: answers['ai_wish'] ? `If AI could do one thing:\n${str(answers['ai_wish'])}` : '',
      frequency:        'Daily',
      skill_needed:     'Identified via TAOS Intelligence Interview',
      ai_readiness:     readiness,
    },
  ].filter(e => e.task_description || e.tools_used?.length)
}

/* ─── Scale labels ───────────────────────────────────────────── */
const SCALE_COLORS = ['#FF6B6B', '#FF9F43', '#F4ED3C', '#A8E6CF', '#C0F43C']

/* ═══════════════════════════════════════════════════════════════ */
export default function ProfilePage() {
  /* Email verify state */
  const [email, setEmail]         = useState('')
  const [verifyError, setVerifyError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [staffName, setStaffName] = useState('')
  const [staffId, setStaffId]     = useState('')
  const [department, setDept]     = useState('')

  /* Interview state */
  const [questions, setQuestions] = useState<Question[]>([])
  const [step, setStep]           = useState(-1)   // -1 = verify screen
  const [answers, setAnswers]     = useState<Record<string, string | string[] | number>>({})
  const [currentInput, setCurrentInput] = useState<string | string[] | number>('')

  /* Submit state */
  const [pending, setPending] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone]       = useState(false)

  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  /* Focus input when step changes */
  useEffect(() => {
    if (step >= 0) {
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [step])

  /* ── Verify email ── */
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setVerifyError('')
    setVerifying(true)
    const res  = await fetch('/api/verify-staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    })
    const data = await res.json()
    setVerifying(false)
    if (data.error) { setVerifyError(data.error); return }

    const dept = data.department ?? 'Other'
    const qs   = buildQuestions(dept)
    setStaffName(data.name)
    setStaffId(data.id)
    setDept(dept)
    setQuestions(qs)
    setStep(0)
  }

  /* ── Navigate between questions ── */
  function saveCurrentAndAdvance() {
    const q = questions[step]
    const val = currentInput
    if (q.type !== 'scale' && q.type !== 'chips' && q.type !== 'select') {
      if (String(val).trim() === '') return
    }
    setAnswers(prev => ({ ...prev, [q.id]: val }))
    setCurrentInput(answers[questions[step + 1]?.id] ?? '')
    setStep(s => s + 1)
  }

  function goBack() {
    const q = questions[step]
    setAnswers(prev => ({ ...prev, [q.id]: currentInput }))
    setCurrentInput(answers[questions[step - 1]?.id] ?? '')
    setStep(s => s - 1)
  }

  /* ── Submit ── */
  async function handleSubmit() {
    const q   = questions[step]
    const all = { ...answers, [q.id]: currentInput }
    setAnswers(all)
    setPending(true)
    setSubmitError('')

    const entries = buildTaskEntries(all, department, staffId)
    if (!entries.length) {
      setSubmitError('Please answer at least a few questions.')
      setPending(false)
      return
    }

    const fd = new FormData()
    fd.set('staff_id', staffId)
    fd.set('tasks', JSON.stringify(entries))

    const result = await submitProfile(fd)
    if (result.error) { setSubmitError(result.error); setPending(false); return }
    setDone(true)
  }

  /* ── Toggle chip ── */
  function toggleChip(val: string) {
    setCurrentInput(prev => {
      const arr: string[] = Array.isArray(prev) ? [...prev] : []
      return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
    })
  }

  /* ── Helpers ── */
  const progress    = step >= 0 ? Math.round(((step + 1) / questions.length) * 100) : 0
  const isLastStep  = step === questions.length - 1
  const q           = step >= 0 ? questions[step] : null
  const firstName   = staffName.split(' ')[0]

  /* ── Styles ── */
  const S = {
    page:    { fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#0C0E10', minHeight: '100vh', color: 'white' },
    nav:     { background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 40px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    center:  { maxWidth: '640px', margin: '0 auto', padding: '0 24px' },
    label:   { fontSize: '11px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase' as const, color: '#00A5A3' },
    input:   { width: '100%', padding: '16px 20px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.15)', fontSize: '15px', color: 'white', outline: 'none', fontFamily: 'inherit', background: 'rgba(255,255,255,0.07)', resize: 'vertical' as const, lineHeight: 1.6, boxSizing: 'border-box' as const },
  }

  /* ───────── DONE SCREEN ───────── */
  if (done) {
    return (
      <div style={{ ...S.page, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '3px solid #C0F43C', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px', background: '#C0F43C15' }}>
          <svg width="36" height="36" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style={S.label}>Intelligence Captured</div>
        <h1 style={{ fontSize: '38px', fontWeight: 800, margin: '16px 0 12px', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
          TAOS has heard you,<br /><span style={{ color: '#C0F43C' }}>{firstName}.</span>
        </h1>
        <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: '440px', margin: '0 auto 40px' }}>
          Your answers will shape what gets built first. Every input from the team makes TAOS sharper.
        </p>
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '18px', padding: '24px 28px', marginBottom: '36px', textAlign: 'left', maxWidth: '420px' }}>
          <div style={{ ...S.label, marginBottom: '14px' }}>What happens with your answers</div>
          {[
            'Your intelligence profile is now in the TAOS system',
            'Gemini AI will analyse patterns across all staff',
            'Your department\'s top automation wins get surfaced',
            'TAOS builds what the team needs most — starting now',
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', padding: '9px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.07)' : 'none', alignItems: 'center' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: i === 0 ? '#C0F43C' : 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: i === 0 ? '#C0F43C' : 'rgba(255,255,255,0.6)', fontWeight: i === 0 ? 600 : 400 }}>{t}</span>
            </div>
          ))}
        </div>
        <Link href="/" style={{ background: '#C0F43C', color: '#1E2124', fontSize: '14px', fontWeight: 800, padding: '14px 32px', borderRadius: '50px', textDecoration: 'none' }}>
          See Live Tracker
        </Link>
      </div>
    )
  }

  /* ───────── EMAIL VERIFY SCREEN ───────── */
  if (step === -1) {
    return (
      <div style={{ ...S.page, background: '#F2F5F5', color: '#1E2124' }}>
        <nav style={{ background: '#010103', padding: '0 48px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div style={{ width: '28px', height: '28px', background: '#00A5A3', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>TAOS</span>
          </Link>
        </nav>
        <div style={{ maxWidth: '480px', margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
          <div style={{ width: '60px', height: '60px', background: '#1E2124', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="28" height="28" fill="none" stroke="#C0F43C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '30px', fontWeight: 800, color: '#1E2124', marginBottom: '10px', letterSpacing: '-0.5px' }}>
            Map Your Intelligence
          </h1>
          <p style={{ fontSize: '15px', color: '#464D53', lineHeight: 1.7, marginBottom: '32px' }}>
            TAOS will ask you smart, department-specific questions based on your role. Takes 5 minutes. Your answers shape what gets built first.
          </p>
          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '24px', padding: '36px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
            <form onSubmit={handleVerify}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1E2124', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px', textAlign: 'left' }}>
                Work Email
              </label>
              <input
                type="email" required value={email}
                onChange={e => { setEmail(e.target.value); setVerifyError('') }}
                placeholder="you@tresconglobal.com"
                style={{ width: '100%', padding: '13px 16px', borderRadius: '12px', border: `1.5px solid ${verifyError ? '#FECACA' : '#E5E7EB'}`, fontSize: '15px', color: '#1E2124', outline: 'none', fontFamily: 'inherit', background: '#FAFAFA', marginBottom: verifyError ? '8px' : '16px', boxSizing: 'border-box' }}
              />
              {verifyError && <p style={{ fontSize: '13px', color: '#C0392B', marginBottom: '12px', textAlign: 'left', fontWeight: 600 }}>{verifyError}</p>}
              <button
                type="submit" disabled={verifying}
                style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: verifying ? '#E5E7EB' : '#C0F43C', color: verifying ? '#999' : '#1E2124', fontSize: '14px', fontWeight: 800, cursor: verifying ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {verifying ? 'Looking you up...' : (
                  <>
                    Start My Intelligence Interview
                    <svg width="14" height="14" fill="none" stroke="#1E2124" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                  </>
                )}
              </button>
            </form>
          </div>
          <p style={{ marginTop: '16px', fontSize: '13px', color: '#888' }}>
            Haven&apos;t joined yet?{' '}
            <Link href="/join" style={{ color: '#00A5A3', fontWeight: 700, textDecoration: 'none' }}>Join first</Link>
          </p>
        </div>
      </div>
    )
  }

  /* ───────── INTERVIEW SCREEN ───────── */
  const chipValues: string[] = Array.isArray(currentInput) ? (currentInput as string[]) : []
  const scaleValue: number   = typeof currentInput === 'number' ? currentInput : 0
  const textValue: string    = typeof currentInput === 'string' ? currentInput : ''
  const canAdvance = q
    ? (q.type === 'chips' ? chipValues.length > 0
      : q.type === 'scale' ? scaleValue > 0
      : q.type === 'select' ? textValue !== ''
      : textValue.trim().length > 0)
    : false

  return (
    <div style={S.page}>
      {/* Nav */}
      <nav style={S.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div style={{ width: '28px', height: '28px', background: '#00A5A3', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>TAOS</span>
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4px' }}>|</span>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>Intelligence Interview</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#C0F43C20', border: '1px solid #C0F43C40', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#C0F43C' }}>{staffName.charAt(0)}</span>
          </div>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{firstName} — {department}</span>
        </div>
      </nav>

      {/* Progress bar */}
      <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #00A5A3, #C0F43C)', transition: 'width 0.4s ease' }} />
      </div>

      <div style={{ ...S.center, paddingTop: '60px', paddingBottom: '80px' }}>

        {/* Step counter */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
            Question {step + 1} of {questions.length}
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#00A5A3', letterSpacing: '1px' }}>
            {progress}% complete
          </div>
        </div>

        {q && (
          <div key={q.id} style={{ animation: 'fadeSlide 0.35s ease' }}>

            {/* TAOS asking indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg, #00A5A3, #005F7A)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: '#00A5A3', textTransform: 'uppercase' }}>TAOS Intelligence</span>
            </div>

            {/* Question text */}
            <h2 style={{ fontSize: '26px', fontWeight: 800, lineHeight: 1.3, marginBottom: '10px', letterSpacing: '-0.3px' }}>
              {q.question}
            </h2>
            {q.subtext && (
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, marginBottom: '28px' }}>{q.subtext}</p>
            )}
            {!q.subtext && <div style={{ height: '28px' }} />}

            {/* ── TEXTAREA ── */}
            {(q.type === 'textarea') && (
              <textarea
                ref={inputRef}
                rows={5}
                value={textValue}
                onChange={e => setCurrentInput(e.target.value)}
                placeholder={q.placeholder ?? ''}
                style={{ ...S.input, minHeight: '140px' }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canAdvance) {
                    e.preventDefault()
                    isLastStep ? handleSubmit() : saveCurrentAndAdvance()
                  }
                }}
              />
            )}

            {/* ── TEXT ── */}
            {q.type === 'text' && (
              <input
                type="text"
                value={textValue}
                onChange={e => setCurrentInput(e.target.value)}
                placeholder={q.placeholder ?? ''}
                style={{ ...S.input, resize: 'none' }}
              />
            )}

            {/* ── CHIPS ── */}
            {q.type === 'chips' && (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {(q.options ?? []).map(opt => {
                  const sel = chipValues.includes(opt)
                  return (
                    <button
                      key={opt} type="button" onClick={() => toggleChip(opt)}
                      style={{
                        padding: '10px 18px', borderRadius: '50px',
                        border: `1.5px solid ${sel ? '#C0F43C' : 'rgba(255,255,255,0.15)'}`,
                        background: sel ? '#C0F43C15' : 'transparent',
                        color: sel ? '#C0F43C' : 'rgba(255,255,255,0.55)',
                        fontSize: '13px', fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
            )}

            {/* ── SELECT ── */}
            {q.type === 'select' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(q.options ?? []).map(opt => {
                  const sel = textValue === opt
                  return (
                    <button
                      key={opt} type="button" onClick={() => setCurrentInput(opt)}
                      style={{
                        padding: '14px 20px', borderRadius: '14px', textAlign: 'left',
                        border: `1.5px solid ${sel ? '#00A5A3' : 'rgba(255,255,255,0.1)'}`,
                        background: sel ? 'rgba(0,165,163,0.12)' : 'rgba(255,255,255,0.03)',
                        color: sel ? 'white' : 'rgba(255,255,255,0.6)',
                        fontSize: '14px', fontWeight: sel ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {opt}
                      {sel && (
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#00A5A3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="10" height="10" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* ── SCALE (AI readiness) ── */}
            {q.type === 'scale' && (
              <div>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  {(q.options ?? []).map((label, i) => {
                    const n   = i + 1
                    const sel = scaleValue === n
                    const col = SCALE_COLORS[i]
                    return (
                      <button
                        key={n} type="button" onClick={() => setCurrentInput(n)}
                        style={{
                          flex: '1 1 120px', padding: '14px 10px', borderRadius: '14px', textAlign: 'center',
                          border: `1.5px solid ${sel ? col : 'rgba(255,255,255,0.1)'}`,
                          background: sel ? `${col}18` : 'rgba(255,255,255,0.03)',
                          cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ fontSize: '22px', fontWeight: 800, color: sel ? col : 'rgba(255,255,255,0.3)', marginBottom: '6px' }}>{n}</div>
                        <div style={{ fontSize: '11px', color: sel ? col : 'rgba(255,255,255,0.35)', fontWeight: sel ? 700 : 400, lineHeight: 1.4 }}>{label}</div>
                      </button>
                    )
                  })}
                </div>
                {scaleValue > 0 && (
                  <div style={{ background: `${SCALE_COLORS[scaleValue - 1]}15`, border: `1px solid ${SCALE_COLORS[scaleValue - 1]}30`, borderRadius: '12px', padding: '12px 16px', fontSize: '13px', color: SCALE_COLORS[scaleValue - 1], fontWeight: 600 }}>
                    {(q.options ?? [])[scaleValue - 1]}
                  </div>
                )}
              </div>
            )}

            {/* Hint for textarea */}
            {q.type === 'textarea' && (
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', marginTop: '10px' }}>
                Press Cmd+Enter to continue
              </p>
            )}

            {/* Error */}
            {submitError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 16px', marginTop: '16px', fontSize: '13px', color: '#C0392B', fontWeight: 600 }}>
                {submitError}
              </div>
            )}

            {/* Nav buttons */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '32px', alignItems: 'center', justifyContent: 'space-between' }}>
              {step > 0 ? (
                <button type="button" onClick={goBack} style={{ padding: '12px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
                  Back
                </button>
              ) : <div />}

              <button
                type="button"
                disabled={!canAdvance || pending}
                onClick={isLastStep ? handleSubmit : saveCurrentAndAdvance}
                style={{
                  padding: '14px 28px', borderRadius: '14px', border: 'none',
                  background: canAdvance && !pending ? (isLastStep ? '#C0F43C' : '#00A5A3') : 'rgba(255,255,255,0.1)',
                  color: canAdvance && !pending ? (isLastStep ? '#1E2124' : 'white') : 'rgba(255,255,255,0.25)',
                  fontSize: '14px', fontWeight: 800, cursor: canAdvance && !pending ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px',
                  transition: 'all 0.2s ease',
                }}
              >
                {pending ? 'Submitting to TAOS...' : isLastStep ? (
                  <>
                    Submit to TAOS
                    <svg width="14" height="14" fill="none" stroke="#1E2124" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  </>
                ) : (
                  <>
                    Next
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                  </>
                )}
              </button>
            </div>

          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
