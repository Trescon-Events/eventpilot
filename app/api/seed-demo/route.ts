import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026'
const DEMO_TAG   = '@demo.tai'  // all demo emails end with this — used for safe deletion

/* ─────────────────────────────────────────────────────────────────
   DEMO STAFF — 21 people across 4 offices, realistic distribution
───────────────────────────────────────────────────────────────── */
const DEMO_STAFF = [
  /* Dubai (5) */
  { name: 'Ahmed Hassan',        email: 'ahmed.hassan@demo.tai',        office_id: 'dubai',     department: 'Events',              role: 'Senior Event Manager',   complete: true  },
  { name: 'Mohammed Al-Rashid',  email: 'mohammed.alrashid@demo.tai',   office_id: 'dubai',     department: 'Sales & Sponsorship', role: 'Sponsorship Director',   complete: true  },
  { name: 'Lara Haddad',         email: 'lara.haddad@demo.tai',         office_id: 'dubai',     department: 'Marketing',           role: 'Marketing Manager',      complete: true  },
  { name: 'Fatima Al-Zahra',     email: 'fatima.alzahra@demo.tai',      office_id: 'dubai',     department: 'Finance',             role: 'Finance Manager',        complete: false },
  { name: 'Yusuf Al-Mansoori',   email: 'yusuf.almansoori@demo.tai',    office_id: 'dubai',     department: 'Leadership',          role: 'VP Operations',          complete: false },
  /* Bangalore (10) */
  { name: 'Priya Sharma',        email: 'priya.sharma@demo.tai',        office_id: 'bangalore', department: 'Marketing',           role: 'Digital Marketing Lead', complete: true  },
  { name: 'Rohit Verma',         email: 'rohit.verma@demo.tai',         office_id: 'bangalore', department: 'IT',                  role: 'Tech Lead',              complete: true  },
  { name: 'Ananya Krishnan',     email: 'ananya.krishnan@demo.tai',     office_id: 'bangalore', department: 'HR & Recruitment',    role: 'HR Manager',             complete: true  },
  { name: 'Sanjay Mehta',        email: 'sanjay.mehta@demo.tai',        office_id: 'bangalore', department: 'Operations',          role: 'Operations Manager',     complete: true  },
  { name: 'Arun Kumar',          email: 'arun.kumar@demo.tai',          office_id: 'bangalore', department: 'Finance',             role: 'Financial Analyst',      complete: true  },
  { name: 'Shreya Patel',        email: 'shreya.patel@demo.tai',        office_id: 'bangalore', department: 'Sales & Sponsorship', role: 'Sales Executive',        complete: true  },
  { name: 'Vikram Singh',        email: 'vikram.singh@demo.tai',        office_id: 'bangalore', department: 'DemandifyMedia',      role: 'Performance Marketing',  complete: true  },
  { name: 'Sneha Kulkarni',      email: 'sneha.kulkarni@demo.tai',      office_id: 'bangalore', department: 'Content & Design',    role: 'Senior Designer',        complete: true  },
  { name: 'Kavya Reddy',         email: 'kavya.reddy@demo.tai',         office_id: 'bangalore', department: 'Events',              role: 'Event Coordinator',      complete: false },
  { name: 'Lakshmi Subramaniam', email: 'lakshmi.subramaniam@demo.tai', office_id: 'bangalore', department: 'Finance',             role: 'Accounts Manager',       complete: false },
  /* Mangalore (3) */
  { name: 'Deepika Nair',        email: 'deepika.nair@demo.tai',        office_id: 'mangalore', department: 'Content & Design',    role: 'Content Manager',        complete: true  },
  { name: 'Pooja Hegde',         email: 'pooja.hegde@demo.tai',         office_id: 'mangalore', department: 'Marketing',           role: 'Social Media Manager',   complete: true  },
  { name: 'Swathi Bhat',         email: 'swathi.bhat@demo.tai',         office_id: 'mangalore', department: 'HR & Recruitment',    role: 'HR Executive',           complete: false },
  /* Manipal (3) */
  { name: 'Ravi Chandrasekhar',  email: 'ravi.chandrasekhar@demo.tai',  office_id: 'manipal',   department: 'IT',                  role: 'Systems Administrator',  complete: true  },
  { name: 'Meera Iyer',          email: 'meera.iyer@demo.tai',          office_id: 'manipal',   department: 'Content & Design',    role: 'Graphic Designer',       complete: true  },
  { name: 'Arjun Nambiar',       email: 'arjun.nambiar@demo.tai',       office_id: 'manipal',   department: 'Sales & Sponsorship', role: 'Sales Associate',        complete: false },
]

/* ─────────────────────────────────────────────────────────────────
   TASK PROFILES — only for staff where complete: true
   Each person gets 2–3 entries matching the real questionnaire shape.
   ai_readiness is calibrated to show a realistic distribution.
───────────────────────────────────────────────────────────────── */
function buildProfiles(staffId: string, name: string) {
  const map: Record<string, {
    readiness: number
    tools: string[]
    proficiency: Record<string, number>
    automation: string
    ai_wish: string
    pain: string
    stuck: string
    ai_proof?: string
    ownership: string
  }> = {
    'Ahmed Hassan': {
      readiness: 3, tools: ['Excel', 'Trello', 'Zoom', 'WhatsApp', 'Email'],
      proficiency: { Excel: 3, Trello: 2, Zoom: 3, WhatsApp: 2 },
      automation: 'Yes — I have something simple that works',
      ai_wish: 'Automatically generate post-event summary reports from my run-of-show notes and attendance data. Currently takes half a day to compile.',
      pain: 'I spend 3+ hours every week chasing vendor confirmations over WhatsApp and email. Same questions, different event, every single time.',
      stuck: 'Chasing people for information or documents',
      ownership: "I'd still want to personally handle the day-of event execution — the human decisions when things go wrong on the floor.",
    },
    'Mohammed Al-Rashid': {
      readiness: 4, tools: ['Salesforce', 'LinkedIn', 'HubSpot', 'ChatGPT', 'PowerPoint'],
      proficiency: { Salesforce: 3, HubSpot: 3, ChatGPT: 4, LinkedIn: 3 },
      automation: 'Yes — I\'ve set up multiple automations',
      ai_wish: 'Draft first-version sponsorship proposals automatically from a deal brief. I waste 2 hours per proposal on formatting and boilerplate.',
      pain: 'Updating Salesforce after every call. Takes 20 minutes of admin per meeting. I often skip it and then lose track.',
      stuck: 'Manual data entry and reporting',
      ai_proof: 'I use ChatGPT to draft proposal first drafts: I feed it the client brief, event details, and our standard package tiers, and it gives me a 90% ready draft in 3 minutes. I also have a HubSpot sequence that auto-sends follow-ups on day 3 and day 7 if there\'s no reply. Saves me about 4 hours per week.',
      ownership: 'I want to keep the final relationship call before close — that conversation still needs to be human.',
    },
    'Lara Haddad': {
      readiness: 3, tools: ['Canva', 'Instagram', 'Mailchimp', 'Hootsuite', 'Google Analytics'],
      proficiency: { Canva: 4, Mailchimp: 2, 'Google Analytics': 2, Hootsuite: 3 },
      automation: 'I tried once but it didn\'t really stick',
      ai_wish: 'Automatically generate social media captions from event briefs. Writing 15 posts per event manually is painful.',
      pain: 'Getting approvals on content. I send a post for review, it gets stuck for 4 days, the moment has passed.',
      stuck: 'Waiting for approvals from leadership',
      ownership: 'Creative direction and brand tone — I don\'t want AI to decide what Trescon sounds like.',
    },
    'Priya Sharma': {
      readiness: 4, tools: ['Canva', 'ChatGPT', 'Google Analytics', 'HubSpot', 'Notion AI'],
      proficiency: { ChatGPT: 4, Canva: 4, 'Google Analytics': 3, 'Notion AI': 3 },
      automation: 'Yes — I\'ve set up multiple automations',
      ai_wish: 'Pull campaign performance data from multiple platforms and generate a weekly summary automatically — I spend every Monday morning doing this manually.',
      pain: 'Briefing design and waiting. A campaign brief takes 30 minutes, then design takes 4 days, then approval another 3. By the time we go live, the window has passed.',
      stuck: 'Communication gaps between teams',
      ai_proof: 'I use ChatGPT to generate first-draft email campaigns — I write the goal, audience, and key message in a structured prompt and get 3 variations back. I pick and edit. Also use Notion AI for all meeting summaries — I paste the transcript and it gives me action items in 30 seconds. ChatGPT also does my monthly performance report drafts.',
      ownership: 'Strategy — which campaign to run, when, for what objective. That\'s where I need to stay.',
    },
    'Rohit Verma': {
      readiness: 5, tools: ['GitHub', 'Jira', 'AWS', 'Terminal/CLI', 'ChatGPT', 'Claude', 'Notion'],
      proficiency: { GitHub: 4, ChatGPT: 4, Claude: 4, AWS: 3 },
      automation: 'I regularly build automations as part of my work',
      ai_wish: 'AI triage system for IT support tickets — auto-classify, assign, and resolve common issues without human intervention.',
      pain: '70% of my time is reactive. Users raise tickets for issues that have been solved 10 times already. No knowledge base, no self-service.',
      stuck: "Tools that don't talk to each other",
      ai_proof: 'I use Claude for code reviews, documentation, and architecture decisions. Built a Python script with OpenAI API that monitors our error logs and auto-creates Jira tickets with suggested fixes for common patterns. Also set up an n8n workflow that routes incoming IT requests to the right team member based on keywords — saves about 2 hours of manual triage per day.',
      ownership: 'Security decisions and infrastructure design — AI can assist but not decide.',
    },
    'Ananya Krishnan': {
      readiness: 2, tools: ['Excel', 'LinkedIn', 'WhatsApp', 'Email', 'Zoom'],
      proficiency: { Excel: 2, LinkedIn: 2, Zoom: 2, Email: 1 },
      automation: 'No — never tried anything like that',
      ai_wish: 'Automatically screen CVs and shortlist candidates matching the job description. I spend 6–8 hours on every bulk hiring round.',
      pain: 'Scheduling interviews. The back-and-forth between 3 people to find a slot takes longer than the interview itself.',
      stuck: 'Chasing people for information or documents',
      ownership: 'Final hire decision — I need to meet the person and trust my read on culture fit.',
    },
    'Sanjay Mehta': {
      readiness: 3, tools: ['Excel', 'Trello', 'WhatsApp', 'Asana', 'Google Sheets'],
      proficiency: { Excel: 3, Trello: 2, Asana: 2, 'Google Sheets': 3 },
      automation: 'Yes — I have something simple that works',
      ai_wish: 'Auto-generate end-of-week status updates from Asana task completion data. Writing them manually every Friday takes 45 minutes.',
      pain: 'Cross-department coordination. I send a request, nobody owns the follow-through, and I have to chase 4 people to close one task.',
      stuck: 'No clear process or ownership',
      ownership: 'Vendor relationships and escalations — those need personal trust built over time.',
    },
    'Arun Kumar': {
      readiness: 3, tools: ['Excel', 'QuickBooks', 'Email', 'WhatsApp', 'Word'],
      proficiency: { Excel: 4, QuickBooks: 3, Word: 2, Email: 2 },
      automation: 'Yes — I have something simple that works',
      ai_wish: 'Automatically reconcile bank statements against QuickBooks entries and flag discrepancies. Currently a 4-hour monthly job.',
      pain: 'Month-end closing. I\'m chasing 6 departments for expense reports, receipts, and approvals at the same time every month.',
      stuck: 'Waiting for approvals from leadership',
      ownership: 'Financial judgment calls — when to defer expense, what to classify as capex. That needs context AI won\'t have.',
    },
    'Shreya Patel': {
      readiness: 4, tools: ['Salesforce', 'HubSpot', 'ChatGPT', 'LinkedIn', 'Zoom'],
      proficiency: { Salesforce: 3, ChatGPT: 3, HubSpot: 3, LinkedIn: 3 },
      automation: 'Yes — I\'ve set up multiple automations',
      ai_wish: 'Personalise outreach emails at scale — same message core but customised per prospect based on their LinkedIn profile and company news.',
      pain: 'Proposal writing. Each one is 80% the same as the last but I write it from scratch every time.',
      stuck: 'Manual data entry and reporting',
      ai_proof: 'I use ChatGPT to personalise outreach emails — I paste in the prospect\'s LinkedIn headline and recent posts and ask it to write a first paragraph that references something relevant. Open rates went from 12% to 31%. Also use it to write first-draft proposals that I then customise.',
      ownership: 'Deal negotiation — rate, bundling, payment terms. That needs live judgment.',
    },
    'Vikram Singh': {
      readiness: 5, tools: ['Meta Ads', 'Google Ads', 'Looker Studio', 'ChatGPT', 'Google Analytics', 'LinkedIn Ads'],
      proficiency: { 'Meta Ads': 4, ChatGPT: 4, 'Looker Studio': 4, 'Google Ads': 4 },
      automation: 'I regularly build automations as part of my work',
      ai_wish: 'AI-generated campaign performance commentary that writes the "so what" interpretation for clients automatically from raw metrics.',
      pain: 'Client reporting. I spend 6 hours every week pulling data, building slides, and writing commentary that says the same things in different ways.',
      stuck: 'Manual data entry and reporting',
      ai_proof: 'I built a Looker Studio automated report that refreshes daily and uses GPT-4 API to generate a 3-sentence performance summary each morning — the client gets an email at 8am with the interpretation, not just the numbers. Also automated budget pacing alerts using Google Scripts + OpenAI. Saves approximately 8 hours per week.',
      ownership: 'Campaign strategy and creative direction — which message, which audience, what angle to test next.',
    },
    'Sneha Kulkarni': {
      readiness: 4, tools: ['Canva', 'Figma', 'ChatGPT', 'Midjourney', 'Adobe Photoshop'],
      proficiency: { Figma: 4, ChatGPT: 3, Midjourney: 3, Canva: 4 },
      automation: 'Yes — I\'ve set up multiple automations',
      ai_wish: 'Auto-generate first-draft visual concepts from event briefs — instead of starting from a blank canvas every time.',
      pain: 'Vague briefs. I receive a message saying "make something nice for the event" and then spend half a day asking clarifying questions.',
      stuck: 'No clear process or ownership',
      ai_proof: 'I use Midjourney to generate mood boards and concept directions before touching Figma. Cuts exploration time from 2 days to 2 hours. Also use ChatGPT to convert vague client feedback into structured design requirements.',
      ownership: 'Final art direction — the eye for what actually looks good, what fits the brand.',
    },
    'Deepika Nair': {
      readiness: 4, tools: ['Canva', 'Adobe Photoshop', 'Notion AI', 'ChatGPT', 'CapCut'],
      proficiency: { Canva: 4, ChatGPT: 3, 'Notion AI': 3, 'Adobe Photoshop': 3 },
      automation: 'Yes — I\'ve set up multiple automations',
      ai_wish: 'Auto-generate article first drafts from a brief and key bullet points. Writing takes 4x longer than editing.',
      pain: 'Content approvals take 2 weeks. By the time something is approved it\'s no longer timely.',
      stuck: 'Waiting for approvals from leadership',
      ai_proof: 'I use ChatGPT to write first drafts from bullet point outlines — I brief it on tone, audience, and purpose and edit the output. Cuts writing time by 70%. Use Notion AI for meeting notes and action item extraction after every content review.',
      ownership: 'Content strategy and editorial direction — what to say, when, to whom.',
    },
    'Pooja Hegde': {
      readiness: 3, tools: ['Canva', 'Instagram', 'Meta Ads', 'Mailchimp', 'Google Analytics'],
      proficiency: { Canva: 3, 'Meta Ads': 2, Instagram: 3, Mailchimp: 2 },
      automation: 'I tried once but it didn\'t really stick',
      ai_wish: 'Suggest the best posting times and content formats for each platform automatically based on our audience data.',
      pain: 'Content volume. I manage 4 social accounts alone. Consistent posting schedule is impossible without burning out.',
      stuck: 'Too many meetings cutting into work time',
      ownership: 'Community management and response tone — that should always sound like a human.',
    },
    'Ravi Chandrasekhar': {
      readiness: 4, tools: ['GitHub', 'Jira', 'Terminal/CLI', 'Copilot', 'AWS'],
      proficiency: { GitHub: 3, Copilot: 4, 'Terminal/CLI': 3, Jira: 2 },
      automation: 'Yes — I\'ve set up multiple automations',
      ai_wish: 'Automated system health dashboard that flags anomalies and suggests fixes without me having to manually check logs every morning.',
      pain: 'Reactive fire-fighting. 60% of my time is fixing issues that shouldn\'t have become issues with proper monitoring.',
      stuck: 'No clear process or ownership',
      ai_proof: 'GitHub Copilot is open in my editor all day — it writes roughly 40% of boilerplate code I used to type manually. Also set up automated monitoring with shell scripts that send Slack alerts when CPU or disk usage spikes. Saves about 1 hour of manual checks per day.',
      ownership: 'Security and access control decisions — those can\'t be automated.',
    },
    'Meera Iyer': {
      readiness: 3, tools: ['Canva', 'Figma', 'Adobe Photoshop', 'Illustrator', 'Word'],
      proficiency: { Canva: 3, Figma: 3, 'Adobe Photoshop': 3, Illustrator: 2 },
      automation: 'No — never tried anything like that',
      ai_wish: 'Generate multiple design variations of the same layout automatically so I can present options without doing each one from scratch.',
      pain: 'Revision cycles. On average I do 5–6 rounds of changes per deliverable. Most feedback is "make it pop more" — not actionable.',
      stuck: 'Waiting for approvals from leadership',
      ownership: 'The final creative decisions — which version to ship, which typography choice.',
    },
  }

  const d = map[name]
  if (!d) return []

  const hasProof = !!d.ai_proof

  return [
    {
      staff_id:          staffId,
      task_name:         'Daily Workflow & Work Pattern',
      task_description:  `What a typical day looks like:\n${d.pain}\n\nTool proficiency: ${Object.entries(d.proficiency).map(([t, l]) => `${t}: ${['Basic','Confident','Advanced','Builder'][l-1]}`).join(', ')}`,
      tools_used:        d.tools,
      tool_proficiency:  d.proficiency,
      frequency:         'Daily',
      ai_readiness:      d.readiness,
    },
    {
      staff_id:          staffId,
      task_name:         'Key Pain Points & Time Drains',
      task_description:  `Biggest time drain:\n${d.pain}\n\nMain cause of delays: ${d.stuck}\n\nWhat they want to keep owning:\n${d.ownership}`,
      automation_history: d.automation,
      frequency:         'Daily',
      ai_readiness:      d.readiness,
    },
    {
      staff_id:          staffId,
      task_name:         'AI Opportunity & Automation Wish',
      task_description:  `If AI could do one thing:\n${d.ai_wish}${hasProof ? `\n\nAI workflow they already use (advanced track):\n${d.ai_proof}` : ''}`,
      ai_proof:          d.ai_proof ?? null,
      tools_unlisted:    null,
      frequency:         'Daily',
      skill_needed:      'Identified via Event Pilot Onboarding Interview',
      ai_readiness:      d.readiness,
    },
  ]
}

/* ─── POST: seed demo data ────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const { admin_code } = await req.json().catch(() => ({}))
  if (admin_code !== ADMIN_CODE) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check for existing demo data
  const { data: existing } = await supabaseAdmin
    .from('staff_members')
    .select('id')
    .ilike('email', `%${DEMO_TAG}`)
    .limit(1)
  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'Demo data already seeded. DELETE first to re-seed.' }, { status: 409 })
  }

  const now = new Date()

  // Insert staff — stagger joined_at over last 48 hours for realism
  const staffRows = DEMO_STAFF.map((s, i) => ({
    name:             s.name,
    email:            s.email,
    office_id:        s.office_id,
    department:       s.department,
    role:             s.role,
    profile_complete: s.complete,
    joined_at:        new Date(now.getTime() - (DEMO_STAFF.length - i) * 7 * 60 * 1000).toISOString(),
  }))

  const { data: insertedStaff, error: staffErr } = await supabaseAdmin
    .from('staff_members')
    .insert(staffRows)
    .select('id, name, profile_complete')

  if (staffErr || !insertedStaff) {
    return NextResponse.json({ error: `Staff insert failed: ${staffErr?.message}` }, { status: 500 })
  }

  // Build and insert task profiles for complete staff
  const taskRows: object[] = []
  for (const member of insertedStaff) {
    if (!member.profile_complete) continue
    const profiles = buildProfiles(member.id, member.name)
    taskRows.push(...profiles)
  }

  const { error: taskErr } = await supabaseAdmin
    .from('staff_task_profiles')
    .insert(taskRows)

  if (taskErr) {
    return NextResponse.json({ error: `Task insert failed: ${taskErr?.message}` }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    staff_inserted: insertedStaff.length,
    profiles_inserted: taskRows.length,
    message: `Seeded ${insertedStaff.length} staff (${insertedStaff.filter(s => s.profile_complete).length} with interview profiles). All emails end in @demo.tai for easy identification.`,
  })
}

/* ─── DELETE: clear all demo data ────────────────────────────── */
export async function DELETE(req: NextRequest) {
  const { admin_code } = await req.json().catch(() => ({}))
  if (admin_code !== ADMIN_CODE) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Find demo staff IDs
  const { data: demoStaff } = await supabaseAdmin
    .from('staff_members')
    .select('id')
    .ilike('email', `%${DEMO_TAG}`)

  if (!demoStaff || demoStaff.length === 0) {
    return NextResponse.json({ message: 'No demo data found.' })
  }

  const ids = demoStaff.map(s => s.id)

  // Delete task profiles first (FK constraint)
  await supabaseAdmin.from('staff_task_profiles').delete().in('staff_id', ids)

  // Delete staff
  const { error } = await supabaseAdmin.from('staff_members').delete().in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, cleared: ids.length })
}
