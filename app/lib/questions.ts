/* ─── Shared interview question definitions ──────────────────────
   Used by both /profile (staff interview) and /admin (questionnaire preview)
─────────────────────────────────────────────────────────────────── */

export type QType = 'textarea' | 'chips' | 'scale' | 'select' | 'text' | 'proficiency'
export type Question = {
  id: string
  question: string
  subtext?: string
  type: QType
  options?: string[]
  placeholder?: string
  /** If set, this question is only shown when the referenced question's answer is >= minValue */
  conditionalOn?: { questionId: string; minValue: number }
}

/* ─── Department tool chips ──────────────────────────────────── */
export const DEPT_TOOLS: Record<string, string[]> = {
  'Events':               ['Excel', 'Word', 'WhatsApp', 'Email', 'Zoom', 'Google Sheets', 'Trello', 'Asana', 'PowerPoint', 'Salesforce', 'Other'],
  'Sales & Sponsorship':  ['Salesforce', 'HubSpot', 'Excel', 'PowerPoint', 'LinkedIn', 'WhatsApp', 'Email', 'Zoom', 'Google Sheets', 'Other'],
  'Marketing':            ['Canva', 'Mailchimp', 'Instagram', 'LinkedIn', 'Google Analytics', 'HubSpot', 'Excel', 'PowerPoint', 'Hootsuite', 'Meta Ads', 'Other'],
  'Finance':              ['Excel', 'QuickBooks', 'Xero', 'SAP', 'Tally', 'Email', 'WhatsApp', 'Word', 'Other'],
  'Operations':           ['Excel', 'Google Sheets', 'Trello', 'Asana', 'WhatsApp', 'Email', 'Zoom', 'Word', 'Other'],
  'IT':                   ['GitHub', 'Jira', 'Slack', 'Zoom', 'Excel', 'Terminal/CLI', 'AWS', 'Google Cloud', 'Notion', 'Other'],
  'HR & Recruitment':     ['Excel', 'LinkedIn', 'WhatsApp', 'Email', 'Zoom', 'Google Sheets', 'Word', 'ATS Software', 'Other'],
  'Content & Design':     ['Canva', 'Adobe Photoshop', 'Adobe Illustrator', 'Figma', 'Word', 'PowerPoint', 'CapCut', 'Premiere Pro', 'ChatGPT', 'Other'],
  'Government Relations': ['Word', 'Email', 'WhatsApp', 'Excel', 'PDF Tools', 'Government Portals', 'Other'],
  'DemandifyMedia':       ['Meta Ads', 'Google Ads', 'LinkedIn Ads', 'Canva', 'HubSpot', 'Google Analytics', 'Excel', 'Looker Studio', 'Other'],
  'Leadership':           ['Excel', 'PowerPoint', 'Email', 'WhatsApp', 'Zoom', 'Salesforce', 'Notion', 'Other'],
  'Founder / Executive':  ['Email', 'WhatsApp', 'Zoom', 'PowerPoint', 'Excel', 'Notion', 'Salesforce', 'LinkedIn', 'Google Analytics', 'Other'],
}
export const DEFAULT_TOOLS = ['Excel', 'Email', 'WhatsApp', 'Zoom', 'Word', 'Google Sheets', 'Other']

/* ─── Department-specific questions ─────────────────────────── */
export const DEPT_QUESTIONS: Record<string, Question[]> = {
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
      placeholder: "First I find them on LinkedIn, send an email, then a deck goes out — and that's usually where it stalls for 2 weeks...",
    },
    {
      id: 'sales_bottleneck',
      question: "What's your biggest bottleneck in closing deals?",
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
      question: "What's your content pipeline like — and where does it actually stall?",
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
      question: "How do you currently measure what's working?",
      type: 'select',
      options: ['Platform analytics (manually)', 'Weekly reports I build myself', 'HubSpot/CRM tracking', 'No structured measurement', 'My manager tracks it'],
    },
  ],
  'Finance': [
    {
      id: 'finance_cycle',
      question: 'Walk us through your financial cycle — invoices, reconciliation, reporting. Where does it drag?',
      type: 'textarea',
      placeholder: "Month-end is the worst. I'm chasing approvals from 6 departments while trying to reconcile in Excel...",
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
      placeholder: "I manage vendor contracts and logistics — it usually breaks at the handoff between departments where no one owns the next step...",
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
      options: ['WhatsApp groups', 'Excel tracker', 'Trello / Asana / Notion', 'Email threads', 'Verbal / memory', "Multiple tools — it's messy"],
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
      placeholder: "We have our event management system, email server, Salesforce, and I'm also the one managing the website and network...",
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
      question: "How does your actual week break down? Where is your time going that shouldn't need your attention?",
      type: 'textarea',
      placeholder: "Mondays are all-hands, then I'm in approvals and follow-ups most of the week. I can rarely think strategically during working hours...",
    },
    {
      id: 'lead_decisions',
      question: 'What decisions take the longest because of missing or delayed information?',
      type: 'textarea',
      placeholder: "Hiring decisions are slow because I don't have pipeline visibility. Revenue decisions wait on Finance. KPI updates come too late...",
    },
    {
      id: 'lead_visibility',
      question: 'What do you wish you could see in real-time across the business?',
      type: 'chips',
      options: ['Revenue & pipeline', 'Staff output & capacity', 'Event P&L at a glance', 'Vendor performance', 'Team workload', 'Customer/client health', 'Department KPIs', 'Approval bottlenecks'],
    },
  ],
  'Founder / Executive': [
    {
      id: 'founder_org',
      question: 'Give us a real picture of how you run the company week to week. Where is your time actually going?',
      subtext: 'Not the vision — what does a real Monday to Friday look like for you right now?',
      type: 'textarea',
      placeholder: 'Most of my week is in senior leadership reviews, deal conversations, and approvals that should probably not need me. Strategic thinking happens in gaps...',
    },
    {
      id: 'founder_visibility',
      question: 'What do you wish you could see across the organisation in real time — but currently cannot?',
      type: 'chips',
      options: ['Revenue & deal pipeline', 'Department KPIs at a glance', 'Staff output & capacity', 'Event P&L in real time', 'Team AI adoption progress', 'Client & partner health', 'Hiring & HR pipeline', 'Approval bottlenecks'],
    },
    {
      id: 'founder_decisions',
      question: 'Which decisions take longest — and why? What information are you usually waiting on?',
      type: 'textarea',
      placeholder: "Hiring decisions are slow because I don't have a clear view of who's in the pipeline. Revenue calls wait on Finance. I make a lot of calls on incomplete data...",
    },
    {
      id: 'founder_ai_vision',
      question: 'If AI were fully embedded in Trescon — what would change first? Where would the biggest impact be?',
      subtext: "Think company-wide: which department, which process, which person's role would look most different?",
      type: 'textarea',
      placeholder: 'The Sales team would close faster if AI handled the first 3 follow-ups. Finance would give me real-time P&L without manual builds. Events would...',
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
      question: "What's the single biggest inefficiency in how your work gets done today?",
      type: 'textarea',
      placeholder: 'The thing that slows everything down is...',
    },
  ],
}

/* ─── Core questions (everyone gets these) ───────────────────── */
export const CORE_QUESTIONS: Question[] = [
  /* ── ACT 1: Current State ── */
  {
    id: 'daily_work',
    question: 'Give us a real picture of your week. What does a typical working day actually look like for you?',
    subtext: 'Not the job description — tell us what really happens from morning to end of day.',
    type: 'textarea',
    placeholder: 'I usually start by checking emails and WhatsApp messages from the night before. Then I have...',
  },
  {
    id: 'time_drain',
    question: "What's the single task that eats the most time but probably shouldn't?",
    subtext: "The thing you're doing manually that a smarter system should handle.",
    type: 'textarea',
    placeholder: 'Every week I spend hours doing...',
  },

  /* ── ACT 2: Capability Baseline ── */
  {
    id: 'tools',
    question: 'Which tools do you actually use every day to get work done?',
    subtext: 'Select everything you touch regularly. Be honest — even the unofficial ones.',
    type: 'chips',
    options: [],
  },
  {
    id: 'tool_proficiency',
    question: 'How well do you actually know these tools?',
    subtext: 'Rate yourself on your top 4 tools. Be honest — this shapes the courses EventPilot recommends specifically for you.',
    type: 'proficiency',
  },
  {
    id: 'tools_unlisted',
    question: 'Using a tool we didn\'t mention above?',
    subtext: 'Tell us the name and what you use it for. This helps EventPilot build a complete picture of how you work.',
    type: 'text',
    placeholder: 'e.g. Notion for project tracking, ClickUp for team tasks, Monday.com for...',
  },
  {
    id: 'stuck',
    question: "When your work gets stuck or delayed — what's usually the real cause?",
    subtext: 'Select all that apply.',
    type: 'chips',
    options: [
      'Waiting for approvals from leadership',
      'Chasing people for information or documents',
      'Manual data entry and reporting',
      'Too many meetings cutting into work time',
      'Communication gaps between teams',
      'No clear process or ownership',
      "Tools that don't talk to each other",
    ],
  },

  /* ── ACT 3: Automation Appetite ── */
  {
    id: 'ai_wish',
    question: 'If you could automate one part of your workflow from tomorrow — what would it be?',
    subtext: 'This answer directly shapes what gets built first for your department.',
    type: 'textarea',
    placeholder: "I'd want it to automatically...",
  },
  {
    id: 'automation_history',
    question: 'Have you ever set up any kind of automation — even something simple?',
    subtext: 'An email rule, a Zap, an Excel macro, a recurring report, anything that runs without you.',
    type: 'select',
    options: [
      'No — never tried anything like that',
      'I tried once but it didn\'t really stick',
      'Yes — I have something simple that works',
      'Yes — I\'ve set up multiple automations',
      'I regularly build automations as part of my work',
    ],
  },
  {
    id: 'ai_readiness',
    question: 'Where are you with AI tools right now — honestly?',
    subtext: 'Your answer here determines your starting track on EventPilot. Levels 4–5 mean you will be expected to lead an AI pilot in your department — not just attend training.',
    type: 'scale',
    options: [
      "Haven't used AI tools in my work at all",
      'Used AI for one-off tasks — writing, searching, ideas',
      'Use AI regularly for specific repeatable tasks',
      "Built a workflow or prompt setup that I use every week",
      'Actively seek new AI tools and have integrated multiple into my work',
    ],
  },
  {
    id: 'ai_proof',
    question: "You said you build AI workflows — describe one you actually use.",
    subtext: "Be specific: what does it do, which tool, how often? This is your brief for the Advanced track. Thin answers get basic training.",
    type: 'textarea',
    placeholder: "I have a ChatGPT prompt I run every Monday to draft my status update — it pulls my task list and formats it. Takes 5 minutes instead of 45. I also have a Notion AI template that...",
    conditionalOn: { questionId: 'ai_readiness', minValue: 4 },
  },
  {
    id: 'ownership_intent',
    question: 'Even as AI takes on more of your work — what\'s one thing you\'d want to keep doing yourself?',
    subtext: 'There\'s no wrong answer. This tells us where to augment, not replace.',
    type: 'textarea',
    placeholder: 'I\'d still want to personally handle... because...',
  },
]

/* ─── Build full question list for a department ──────────────── */
export function buildQuestions(department: string): Question[] {
  const tools  = DEPT_TOOLS[department] ?? DEFAULT_TOOLS
  const deptQs = DEPT_QUESTIONS[department] ?? DEPT_QUESTIONS['Other']
  const qs     = CORE_QUESTIONS.map(q => q.id === 'tools' ? { ...q, options: tools } : q)
  // Insert dept questions after the first 2 core questions (daily_work, time_drain)
  // then all remaining core questions (tools, tool_proficiency, tools_unlisted, stuck, ai_wish, automation_history, ai_readiness, ownership_intent)
  return [...qs.slice(0, 2), ...deptQs, ...qs.slice(2)]
}

export const ALL_DEPARTMENTS = [
  'Founder / Executive',
  'Events', 'Sales & Sponsorship', 'Marketing', 'Finance', 'Operations',
  'IT', 'HR & Recruitment', 'Content & Design', 'Government Relations',
  'DemandifyMedia', 'Leadership', 'Other',
]

/* ─── Proficiency level definitions (used by profile + questionnaire preview) ─── */
export const PROFICIENCY_LEVELS = [
  { level: 1, label: 'Basic',     desc: 'I follow steps, someone set it up for me',    color: '#FF9F43' },
  { level: 2, label: 'Confident', desc: 'I figure most things out myself',              color: '#7A6600' },
  { level: 3, label: 'Advanced',  desc: "Use features most people don't, troubleshoot", color: '#00A5A3' },
  { level: 4, label: 'Builder',   desc: "I've automated with it / set it up for others", color: '#3D6B00' },
]
