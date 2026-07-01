/**
 * Bespoke Tracker API
 * GET  — list all bespoke projects (with staff names)
 * POST — create new bespoke project + auto-create event + auto-generate tasks
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// ── Task templates per phase/week based on SOP ──────────────────
const TASK_TEMPLATES: { phase: number; week: number; role: string; title: string }[] = [
  // Phase 1 / Week 1: Initiation & Discovery
  { phase: 1, week: 1, role: 'commercial', title: 'Conduct internal cross-functional briefing call' },
  { phase: 1, week: 1, role: 'commercial', title: 'Send client brief questionnaire' },
  { phase: 1, week: 1, role: 'commercial', title: 'Lock ICP parameters, theme, target account wishlist with client' },
  { phase: 1, week: 1, role: 'marketing', title: 'Deliver campaign architecture requirements to Design' },
  { phase: 1, week: 1, role: 'marketing', title: 'Submit DRT data parameters for list building' },
  { phase: 1, week: 1, role: 'marketing', title: 'Draft email announcement campaign' },
  { phase: 1, week: 1, role: 'marketing', title: 'Push landing page live' },
  { phase: 1, week: 1, role: 'delegate', title: 'Deep-dive review of target accounts' },
  { phase: 1, week: 1, role: 'delegate', title: 'Prepare personalized outreach messaging scripts' },
  { phase: 1, week: 1, role: 'design', title: 'Ingest client branding guidelines' },
  { phase: 1, week: 1, role: 'design', title: 'Build landing page wireframe + email headers + social templates' },
  { phase: 1, week: 1, role: 'operations', title: 'Initiate venue sourcing and vendor requirements' },
  { phase: 1, week: 1, role: 'production', title: 'Advisory check on proposed agenda framework' },

  // Phase 2 / Week 2: Aggressive Outreach
  { phase: 2, week: 2, role: 'marketing', title: 'Deploy automated segmented email wave via CRM' },
  { phase: 2, week: 2, role: 'marketing', title: 'Launch organic and paid social media banners' },
  { phase: 2, week: 2, role: 'marketing', title: 'Draft pre-event press release' },
  { phase: 2, week: 2, role: 'delegate', title: 'Execute calling campaigns to target wishlist' },
  { phase: 2, week: 2, role: 'delegate', title: 'Launch LinkedIn outreach' },
  { phase: 2, week: 2, role: 'delegate', title: 'Log all registrations in CRM in real time' },
  { phase: 2, week: 2, role: 'commercial', title: 'Monitor registration velocity, update client' },
  { phase: 2, week: 2, role: 'design', title: 'Ad-hoc assets and print mockups' },
  { phase: 2, week: 2, role: 'operations', title: 'Finalize venue contract' },
  { phase: 2, week: 2, role: 'operations', title: 'Pass print dimensions to Design team' },

  // Phase 2 / Week 3: Mid-Campaign Optimization
  { phase: 2, week: 3, role: 'marketing', title: 'Deploy email wave targeting non-responders' },
  { phase: 2, week: 3, role: 'marketing', title: 'Target high-intent leads (clicks, opens)' },
  { phase: 2, week: 3, role: 'marketing', title: 'Run mid-campaign social media check-ins' },
  { phase: 2, week: 3, role: 'delegate', title: 'Intensify follow-up on warm leads' },
  { phase: 2, week: 3, role: 'delegate', title: 'Provide registration conversion counts to client' },
  { phase: 2, week: 3, role: 'commercial', title: 'Cross-reference registrants with client target requirements' },
  { phase: 2, week: 3, role: 'operations', title: 'Submit print-ready files to production vendors' },
  { phase: 2, week: 3, role: 'design', title: 'Complete all print layouts — freeze asset alterations' },

  // Phase 3 / Week 4: Registration Lock & Confirmation
  { phase: 3, week: 4, role: 'commercial', title: 'Finalize guest list breakdown with client' },
  { phase: 3, week: 4, role: 'marketing', title: 'Deploy logistic broadcasts (venue, calendar, access links)' },
  { phase: 3, week: 4, role: 'marketing', title: 'Close registration forms when limit reached' },
  { phase: 3, week: 4, role: 'delegate', title: 'Execute attendance safeguarding protocol — reminder calls' },
  { phase: 3, week: 4, role: 'delegate', title: 'Send calendar hold emails to all registrants' },
  { phase: 3, week: 4, role: 'operations', title: 'Receive printed materials, check for errors' },
  { phase: 3, week: 4, role: 'operations', title: 'Venue tech rehearsal — AV, mics, catering, stage' },
  { phase: 3, week: 4, role: 'operations', title: 'Organize transport logistics' },

  // Phase 3 / Event Day
  { phase: 3, week: 5, role: 'commercial', title: 'Welcome client representatives onsite' },
  { phase: 3, week: 5, role: 'commercial', title: 'Monitor overall delivery sentiment' },
  { phase: 3, week: 5, role: 'operations', title: 'Direct venue staff, oversee AV desk' },
  { phase: 3, week: 5, role: 'operations', title: 'Manage check-in and badges station' },
  { phase: 3, week: 5, role: 'delegate', title: 'Staff registration desk, cross-reference arrivals' },
  { phase: 3, week: 5, role: 'delegate', title: 'Call missing high-priority delegates morning of event' },
  { phase: 3, week: 5, role: 'marketing', title: 'Document content highlights for post-event' },

  // Phase 4 / Week 5+: Post-Event Closure
  { phase: 4, week: 6, role: 'marketing', title: 'Reconcile registration vs actual attendance lists' },
  { phase: 4, week: 6, role: 'marketing', title: 'Compile post-event press release' },
  { phase: 4, week: 6, role: 'commercial', title: 'Present final post-event report to client' },
  { phase: 4, week: 6, role: 'commercial', title: 'Validate delivery of contractual targets' },
  { phase: 4, week: 6, role: 'commercial', title: 'Issue final project invoice' },
  { phase: 4, week: 6, role: 'commercial', title: 'Initiate cross-sell / renewal discussion' },
]

function calculateDueDate(eventDate: string, week: number): string {
  const d = new Date(eventDate)
  // Week 1 = 28 days before, Week 2 = 21, Week 3 = 14, Week 4 = 7, Week 5 = event day, Week 6 = +3 days
  const offsets: Record<number, number> = { 1: -28, 2: -21, 3: -14, 4: -7, 5: 0, 6: 3 }
  const offset = offsets[week] ?? 0
  d.setDate(d.getDate() + offset)
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

  const tasks = TASK_TEMPLATES.map((t, i) => ({
    project_id: project.id,
    title: t.title,
    phase: t.phase,
    week_number: t.week,
    assigned_to: roleToLead[t.role] || null,
    assigned_role: t.role,
    due_date: body.event_date ? calculateDueDate(body.event_date, t.week) : null,
    status: 'pending',
    sort_order: i,
  }))

  const { error: taskErr } = await supabaseAdmin
    .from('bespoke_tasks')
    .insert(tasks)

  if (taskErr) console.error('Task generation error:', taskErr.message)

  return NextResponse.json({ id: project.id, event_id: event.id, tasks_created: tasks.length }, { status: 201 })
}

// ── PATCH ───────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('bespoke_projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
