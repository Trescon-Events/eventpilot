/**
 * Bespoke Tracker API
 * GET  — list all bespoke projects (with staff names)
 * POST — create new bespoke project + auto-create event + auto-generate tasks
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// ── Task templates per phase/week based on SOP ──────────────────
// formatScope drives Physical vs Webinar filtering at POST time.
//   'both'     — always seeded
//   'physical' — seeded only when project.format is physical or hybrid
//   'virtual'  — seeded only when project.format is virtual (webinar)
type TaskTemplate = {
  phase: number
  week: number
  role: string
  title: string
  formatScope: 'physical' | 'virtual' | 'both'
}

const TASK_TEMPLATES: TaskTemplate[] = [
  // Phase 1 / Week 1: Initiation & Discovery
  { phase: 1, week: 1, role: 'commercial', title: 'Conduct internal cross-functional briefing call', formatScope: 'both' },
  { phase: 1, week: 1, role: 'commercial', title: 'Send client brief questionnaire', formatScope: 'both' },
  { phase: 1, week: 1, role: 'commercial', title: 'Lock ICP parameters, theme, target account wishlist with client', formatScope: 'both' },
  { phase: 1, week: 1, role: 'marketing', title: 'Deliver campaign architecture requirements to Design', formatScope: 'both' },
  { phase: 1, week: 1, role: 'marketing', title: 'Submit DRT data parameters for list building', formatScope: 'both' },
  { phase: 1, week: 1, role: 'marketing', title: 'Draft email announcement campaign', formatScope: 'both' },
  { phase: 1, week: 1, role: 'marketing', title: 'Push landing page live', formatScope: 'both' },
  { phase: 1, week: 1, role: 'delegate', title: 'Deep-dive review of target accounts', formatScope: 'both' },
  { phase: 1, week: 1, role: 'delegate', title: 'Prepare personalized outreach messaging scripts', formatScope: 'both' },
  { phase: 1, week: 1, role: 'design', title: 'Ingest client branding guidelines', formatScope: 'both' },
  { phase: 1, week: 1, role: 'design', title: 'Build landing page wireframe + email headers + social templates', formatScope: 'both' },
  { phase: 1, week: 1, role: 'operations', title: 'Initiate venue sourcing and vendor requirements', formatScope: 'physical' },
  { phase: 1, week: 1, role: 'operations', title: 'Set up webinar platform account and configure event', formatScope: 'virtual' },
  { phase: 1, week: 1, role: 'operations', title: 'Test webinar streaming, chat, Q&A, and polling features', formatScope: 'virtual' },
  { phase: 1, week: 1, role: 'production', title: 'Advisory check on proposed agenda framework', formatScope: 'both' },

  // Phase 2 / Week 2: Aggressive Outreach
  { phase: 2, week: 2, role: 'marketing', title: 'Deploy automated segmented email wave via CRM', formatScope: 'both' },
  { phase: 2, week: 2, role: 'marketing', title: 'Launch organic and paid social media banners', formatScope: 'both' },
  { phase: 2, week: 2, role: 'marketing', title: 'Draft pre-event press release', formatScope: 'both' },
  { phase: 2, week: 2, role: 'delegate', title: 'Execute calling campaigns to target wishlist', formatScope: 'both' },
  { phase: 2, week: 2, role: 'delegate', title: 'Launch LinkedIn outreach', formatScope: 'both' },
  { phase: 2, week: 2, role: 'delegate', title: 'Log all registrations in CRM in real time', formatScope: 'both' },
  { phase: 2, week: 2, role: 'commercial', title: 'Monitor registration velocity, update client', formatScope: 'both' },
  { phase: 2, week: 2, role: 'design', title: 'Ad-hoc assets and print mockups', formatScope: 'physical' },
  { phase: 2, week: 2, role: 'operations', title: 'Finalize venue contract', formatScope: 'physical' },
  { phase: 2, week: 2, role: 'operations', title: 'Pass print dimensions to Design team', formatScope: 'physical' },

  // Phase 2 / Week 3: Mid-Campaign Optimization
  { phase: 2, week: 3, role: 'marketing', title: 'Deploy email wave targeting non-responders', formatScope: 'both' },
  { phase: 2, week: 3, role: 'marketing', title: 'Target high-intent leads (clicks, opens)', formatScope: 'both' },
  { phase: 2, week: 3, role: 'marketing', title: 'Run mid-campaign social media check-ins', formatScope: 'both' },
  { phase: 2, week: 3, role: 'delegate', title: 'Intensify follow-up on warm leads', formatScope: 'both' },
  { phase: 2, week: 3, role: 'delegate', title: 'Provide registration conversion counts to client', formatScope: 'both' },
  { phase: 2, week: 3, role: 'commercial', title: 'Cross-reference registrants with client target requirements', formatScope: 'both' },
  { phase: 2, week: 3, role: 'operations', title: 'Submit print-ready files to production vendors', formatScope: 'physical' },
  { phase: 2, week: 3, role: 'design', title: 'Complete all print layouts — freeze asset alterations', formatScope: 'physical' },
  { phase: 2, week: 3, role: 'operations', title: 'Send webinar access links + calendar invites', formatScope: 'virtual' },

  // Phase 3 / Week 4: Registration Lock & Confirmation
  { phase: 3, week: 4, role: 'commercial', title: 'Finalize guest list breakdown with client', formatScope: 'both' },
  { phase: 3, week: 4, role: 'marketing', title: 'Deploy logistic broadcasts (venue, calendar, access links)', formatScope: 'both' },
  { phase: 3, week: 4, role: 'marketing', title: 'Close registration forms when limit reached', formatScope: 'both' },
  { phase: 3, week: 4, role: 'delegate', title: 'Execute attendance safeguarding protocol — reminder calls', formatScope: 'both' },
  { phase: 3, week: 4, role: 'delegate', title: 'Send calendar hold emails to all registrants', formatScope: 'both' },
  { phase: 3, week: 4, role: 'operations', title: 'Receive printed materials, check for errors', formatScope: 'physical' },
  { phase: 3, week: 4, role: 'operations', title: 'Venue tech rehearsal — AV, mics, catering, stage', formatScope: 'physical' },
  { phase: 3, week: 4, role: 'operations', title: 'Organize transport logistics', formatScope: 'physical' },
  { phase: 3, week: 4, role: 'operations', title: 'Run technical dry-run with speakers on webinar platform', formatScope: 'virtual' },

  // Phase 3 / Event Day
  { phase: 3, week: 5, role: 'commercial', title: 'Welcome client representatives onsite', formatScope: 'both' },
  { phase: 3, week: 5, role: 'commercial', title: 'Monitor overall delivery sentiment', formatScope: 'both' },
  { phase: 3, week: 5, role: 'operations', title: 'Direct venue staff, oversee AV desk', formatScope: 'physical' },
  { phase: 3, week: 5, role: 'operations', title: 'Manage check-in and badges station', formatScope: 'physical' },
  { phase: 3, week: 5, role: 'delegate', title: 'Staff registration desk, cross-reference arrivals', formatScope: 'both' },
  { phase: 3, week: 5, role: 'delegate', title: 'Call missing high-priority delegates morning of event', formatScope: 'both' },
  { phase: 3, week: 5, role: 'marketing', title: 'Document content highlights for post-event', formatScope: 'both' },
  { phase: 3, week: 5, role: 'operations', title: 'Monitor webinar broadcast, chat moderation, technical support', formatScope: 'virtual' },
  { phase: 3, week: 5, role: 'delegate', title: 'Track live attendance via webinar platform, cross-reference with registrations', formatScope: 'virtual' },

  // Phase 4 / Week 5+: Post-Event Closure
  { phase: 4, week: 6, role: 'marketing', title: 'Reconcile registration vs actual attendance lists', formatScope: 'both' },
  { phase: 4, week: 6, role: 'marketing', title: 'Compile post-event press release', formatScope: 'both' },
  { phase: 4, week: 6, role: 'commercial', title: 'Present final post-event report to client', formatScope: 'both' },
  { phase: 4, week: 6, role: 'commercial', title: 'Validate delivery of contractual targets', formatScope: 'both' },
  { phase: 4, week: 6, role: 'commercial', title: 'Issue final project invoice', formatScope: 'both' },
  { phase: 4, week: 6, role: 'commercial', title: 'Initiate cross-sell / renewal discussion', formatScope: 'both' },
]

// Runway-proportional due-date calculator.
//   Phase 1: 0.00 → 0.15 of runway
//   Phase 2: 0.15 → 0.83
//   Phase 3: 0.83 → 1.00
//   Phase 4: fixed offset — eventDate + 10 days
// Within phases 1/2/3, the distinct weekNumbers in that phase are spaced
// evenly across the phase range (n weeks → positions 1/(n+1), 2/(n+1), …).
// A single-week phase places at the midpoint.
function calculateDueDate(
  contractSignedDate: string | null,
  eventDate: string | null,
  phase: number,
  weekNumber: number | null
): string | null {
  if (!contractSignedDate || !eventDate) return null
  const start = new Date(contractSignedDate)
  const end = new Date(eventDate)
  const runwayDays = Math.floor((end.getTime() - start.getTime()) / 86400000)
  if (runwayDays <= 0) return null

  // Phase 4 — fixed offset past event date.
  if (phase === 4) {
    const d = new Date(eventDate)
    d.setDate(d.getDate() + 10)
    return d.toISOString().split('T')[0]
  }

  const phaseRanges: Record<number, [number, number]> = {
    1: [0.00, 0.15],
    2: [0.15, 0.83],
    3: [0.83, 1.00],
  }
  const range = phaseRanges[phase]
  if (!range) return null
  const [rStart, rEnd] = range

  // Collect all distinct week numbers appearing in TASK_TEMPLATES for this phase.
  const weeksInPhase = Array.from(
    new Set(TASK_TEMPLATES.filter(t => t.phase === phase).map(t => t.week))
  ).sort((a, b) => a - b)

  let fraction: number
  if (weeksInPhase.length === 0 || weekNumber == null) {
    fraction = (rStart + rEnd) / 2
  } else if (weeksInPhase.length === 1) {
    fraction = (rStart + rEnd) / 2
  } else {
    const idx = weeksInPhase.indexOf(weekNumber)
    if (idx === -1) {
      fraction = (rStart + rEnd) / 2
    } else {
      // Space weeks evenly: position (idx+1)/(n+1) within [rStart, rEnd]
      const pos = (idx + 1) / (weeksInPhase.length + 1)
      fraction = rStart + pos * (rEnd - rStart)
    }
  }

  const offsetDays = Math.round(runwayDays * fraction)
  const d = new Date(contractSignedDate)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]
}

// ── GET ─────────────────────────────────────────────────────────
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('bespoke_projects')
    .select(`
      *,
      commercial_lead:commercial_lead_id ( id, name ),
      marketing_lead:marketing_lead_id ( id, name ),
      delegate_lead:delegate_lead_id ( id, name ),
      operations_lead:operations_lead_id ( id, name ),
      design_lead:design_lead_id ( id, name )
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get delegate counts per project
  const projectIds = (data ?? []).map(p => p.id)
  let delegateCounts: Record<string, { total: number; registered: number; attended: number }> = {}

  if (projectIds.length > 0) {
    const { data: delegates } = await supabaseAdmin
      .from('bespoke_delegates')
      .select('project_id, stage')
      .in('project_id', projectIds)

    if (delegates) {
      for (const d of delegates) {
        if (!delegateCounts[d.project_id]) delegateCounts[d.project_id] = { total: 0, registered: 0, attended: 0 }
        delegateCounts[d.project_id].total++
        if (['registered', 'confirmed', 'attended'].includes(d.stage)) delegateCounts[d.project_id].registered++
        if (d.stage === 'attended') delegateCounts[d.project_id].attended++
      }
    }
  }

  const enriched = (data ?? []).map(p => ({
    ...p,
    delegate_stats: delegateCounts[p.id] ?? { total: 0, registered: 0, attended: 0 },
  }))

  return NextResponse.json(enriched)
}

// ── POST ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json()

  // 1. Auto-create event record. Column names must match the events table —
  // it has name/event_date/city, not title/start_date/location. `format`
  // lives on bespoke_projects (inserted below), not on events at all.
  const { data: event, error: eventErr } = await supabaseAdmin
    .from('events')
    .insert({
      name:       body.title,
      type:       'bespoke',
      status:     'planning',
      event_date: body.event_date,
      city:       body.city  || null,
      venue:      body.venue || null,
    })
    .select('id')
    .single()

  if (eventErr) return NextResponse.json({ error: 'Failed to create event: ' + eventErr.message }, { status: 500 })

  // 2. Create bespoke project
  const { data: project, error: projErr } = await supabaseAdmin
    .from('bespoke_projects')
    .insert({
      event_id: event.id,
      client_company: body.client_company,
      client_contact_name: body.client_contact_name || null,
      client_contact_email: body.client_contact_email || null,
      client_contact_phone: body.client_contact_phone || null,
      contract_value: body.contract_value || 0,
      contract_signed_date: body.contract_signed_date || null,
      title: body.title,
      format: body.format || 'physical',
      event_date: body.event_date,
      event_time: body.event_time || null,
      city: body.city || null,
      venue: body.venue || null,
      target_delegate_count: body.target_delegate_count || 25,
      target_delegate_profile: body.target_delegate_profile || null,
      commercial_lead_id: body.commercial_lead_id || null,
      marketing_lead_id: body.marketing_lead_id || null,
      delegate_lead_id: body.delegate_lead_id || null,
      operations_lead_id: body.operations_lead_id || null,
      design_lead_id: body.design_lead_id || null,
      production_advisor_id: body.production_advisor_id || null,
      // New wizard fields (webinar + brand assets + manual lead fallbacks)
      webinar_platform: body.webinar_platform || null,
      webinar_link: body.webinar_link || null,
      client_assets_url: body.client_assets_url || null,
      commercial_lead_manual: body.commercial_lead_manual || null,
      marketing_lead_manual: body.marketing_lead_manual || null,
      delegate_lead_manual: body.delegate_lead_manual || null,
      operations_lead_manual: body.operations_lead_manual || null,
      created_by: body.created_by || null,
    })
    .select('id')
    .single()

  if (projErr) return NextResponse.json({ error: 'Failed to create project: ' + projErr.message }, { status: 500 })

  // 3. Auto-generate tasks from SOP templates
  const roleToLead: Record<string, string | null> = {
    commercial: body.commercial_lead_id || null,
    marketing: body.marketing_lead_id || null,
    delegate: body.delegate_lead_id || null,
    operations: body.operations_lead_id || null,
    design: body.design_lead_id || null,
    production: body.production_advisor_id || null,
  }

  // Filter templates by project format:
  //   virtual  → keep 'both' + 'virtual'
  //   physical → keep 'both' + 'physical'
  //   hybrid   → keep 'both' + 'physical' (hybrid runs the physical SOP)
  const projectFormat: 'physical' | 'virtual' | 'hybrid' = body.format || 'physical'
  const applicableTemplates = TASK_TEMPLATES.filter(t => {
    if (t.formatScope === 'both') return true
    if (projectFormat === 'virtual') return t.formatScope === 'virtual'
    return t.formatScope === 'physical'
  })

  const tasks = applicableTemplates.map((t, i) => ({
    project_id: project.id,
    title: t.title,
    phase: t.phase,
    week_number: t.week,
    assigned_to: roleToLead[t.role] || null,
    assigned_role: t.role,
    due_date: calculateDueDate(body.contract_signed_date, body.event_date, t.phase, t.week),
    status: 'pending',
    sort_order: i,
  }))

  // Insert tasks and RETURN the actual inserted rows so we know how many
  // landed, not just how many we intended to send. Previously we only
  // console.error'd on failure and returned tasks_created: tasks.length,
  // which produced silent 0/0-task projects when the insert failed — a
  // Nic reported this on 14 Jul.
  const { data: insertedTasks, error: taskErr } = await supabaseAdmin
    .from('bespoke_tasks')
    .insert(tasks)
    .select('id')

  if (taskErr) {
    console.error('Task generation error:', taskErr.message)
    return NextResponse.json(
      {
        id: project.id,
        event_id: event.id,
        tasks_created: 0,
        task_seed_error: taskErr.message,
        warning: 'Project created but SOP task auto-seed failed — tasks tab will be empty. Please add tasks manually or contact the admin.',
      },
      { status: 207 }, // Multi-Status: project OK, tasks failed
    )
  }

  return NextResponse.json(
    { id: project.id, event_id: event.id, tasks_created: insertedTasks?.length ?? 0 },
    { status: 201 },
  )
}

// ── PATCH ───────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Detect whether this update touches a scheduling field. If so, we
  // recompute every task's due_date after the project update lands.
  const touchesSchedule =
    'contract_signed_date' in updates ||
    'event_date' in updates ||
    'format' in updates

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('bespoke_projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-recalc task due_dates whenever scheduling inputs change.
  // Wrapped so a recompute failure never blocks the PATCH response.
  if (touchesSchedule) {
    try {
      const newContractSignedDate = data?.contract_signed_date ?? null
      const newEventDate = data?.event_date ?? null

      const { data: projectTasks, error: taskLoadErr } = await supabaseAdmin
        .from('bespoke_tasks')
        .select('id, phase, week_number')
        .eq('project_id', id)

      if (taskLoadErr) {
        console.error('PATCH recalc: failed to load tasks:', taskLoadErr.message)
      } else if (projectTasks && projectTasks.length > 0) {
        for (const t of projectTasks) {
          const newDue = calculateDueDate(newContractSignedDate, newEventDate, t.phase, t.week_number)
          const { error: updErr } = await supabaseAdmin
            .from('bespoke_tasks')
            .update({ due_date: newDue })
            .eq('id', t.id)
          if (updErr) console.error(`PATCH recalc: failed to update task ${t.id}:`, updErr.message)
        }
      }
    } catch (e) {
      console.error('PATCH recalc: unexpected error:', e)
    }
  }

  return NextResponse.json(data)
}
