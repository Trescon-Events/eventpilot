/**
 * Bespoke Tracker API
 * GET  — list all bespoke projects (with staff names)
 * POST — create new bespoke project + auto-create event + auto-generate tasks
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// ── Task templates per phase — Nic build_request 2f002c2e 43-task blueprint ──
// formatScope drives Physical vs Webinar filtering at POST time.
//   'both'     — always seeded
//   'physical' — seeded only when project.format is physical or hybrid
//   'virtual'  — seeded only when project.format is virtual (webinar)
// team is the canonical display label (Delegate Team, not Delegacy) written
// to bespoke_tasks.assigned_team. role is the lowercase key used for the
// existing assigned_role column + role→lead FK mapping.
// title supports {{client}} and {{venue}} placeholders — interpolated at
// seed time with project.client_company / (project.venue + ', ' + project.city).
type TaskTeam = 'Commercial' | 'Marketing' | 'Delegate Team' | 'Operations' | 'Design' | 'Production' | 'DRT' | 'Client' | 'All Teams'
type TaskTemplate = {
  phase: number
  week: number
  role: string
  team: TaskTeam
  title: string
  formatScope: 'physical' | 'virtual' | 'both'
}

// Compact team → (role, week-guess) map for the 43-task blueprint. The
// legacy assigned_role column stays populated for badge back-compat.
const TEAM_TO_ROLE: Record<TaskTeam, string> = {
  Commercial: 'commercial', Marketing: 'marketing', 'Delegate Team': 'delegate',
  Operations: 'operations', Design: 'design', Production: 'production',
  DRT: 'marketing', // DRT reports up to marketing per current lead model
  Client: 'commercial', // Client tasks tracked by commercial lead
  'All Teams': 'commercial', // Kickoff-style ownership defaults to commercial
}

const TASK_TEMPLATES: TaskTemplate[] = [
  // ── Phase 1 · Kickoff & Alignment (6 tasks) ─────────────────────────
  { phase: 1, week: 1, team: 'Commercial',   role: 'commercial', formatScope: 'both',     title: 'Send the Initial Requirement Document (Briefing Questionnaire) to {{client}}' },
  { phase: 1, week: 1, team: 'Client',       role: 'commercial', formatScope: 'both',     title: 'Complete and return the Briefing Questionnaire' },
  { phase: 1, week: 1, team: 'Commercial',   role: 'commercial', formatScope: 'both',     title: 'Upload the completed brief to the tracker (or parse it using the AI uploader)' },
  { phase: 1, week: 1, team: 'Commercial',   role: 'commercial', formatScope: 'both',     title: 'Schedule the mandatory cross-functional internal briefing call' },
  { phase: 1, week: 1, team: 'All Teams',    role: 'commercial', formatScope: 'both',     title: 'Hold the internal kickoff meeting to align on roles, target accounts, and the timeline' },
  { phase: 1, week: 1, team: 'Marketing',    role: 'marketing',  formatScope: 'both',     title: 'Collect and review {{client}} brand guidelines, media kit, and logos' },

  // ── Phase 2 · Outreach Runway (17 tasks) ────────────────────────────
  { phase: 2, week: 2, team: 'Design',       role: 'design',     formatScope: 'both',     title: 'Design the {{client}} landing page template and visual draft' },
  { phase: 2, week: 2, team: 'Marketing',    role: 'marketing',  formatScope: 'both',     title: 'Write the copy for the {{client}} landing page and registration form, plan the campaign rollout and social media' },
  { phase: 2, week: 2, team: 'Client',       role: 'commercial', formatScope: 'both',     title: 'Review and lock the {{client}} landing page content and design version' },
  { phase: 2, week: 2, team: 'Design',       role: 'design',     formatScope: 'both',     title: 'Set up the registration forms and embed them on the {{client}} landing page' },
  { phase: 2, week: 2, team: 'Marketing',    role: 'marketing',  formatScope: 'both',     title: 'Write and set up the email engine and prepare the cold filtering automation flow (5 emails)' },
  { phase: 2, week: 2, team: 'Client',       role: 'commercial', formatScope: 'both',     title: 'Approve email copy templates and campaign rollout schedule' },
  { phase: 2, week: 2, team: 'Delegate Team', role: 'delegate',  formatScope: 'both',     title: "Review {{client}}'s target accounts wishlist" },
  { phase: 2, week: 2, team: 'Marketing',    role: 'marketing',  formatScope: 'both',     title: 'Define data parameters with delegate team (geography, titles, sectors) and submit the list brief to the DRT' },
  { phase: 2, week: 2, team: 'Marketing',    role: 'marketing',  formatScope: 'both',     title: 'Source target accounts and scrape contacts for key executive stakeholders' },
  { phase: 2, week: 3, team: 'Marketing',    role: 'marketing',  formatScope: 'both',     title: 'Validate and scrub contact lists using email verification tools (e.g. ZeroBounce)' },
  { phase: 2, week: 3, team: 'Marketing',    role: 'marketing',  formatScope: 'both',     title: 'Upload the contact list into the marketing outreach engine' },
  { phase: 2, week: 3, team: 'Marketing',    role: 'marketing',  formatScope: 'both',     title: 'Launch the email and LinkedIn campaigns' },
  { phase: 2, week: 3, team: 'Delegate Team', role: 'delegate',  formatScope: 'both',     title: 'Execute direct outreach campaigns (calls/emails) to secure qualified registrations' },
  { phase: 2, week: 3, team: 'Marketing',    role: 'marketing',  formatScope: 'both',     title: 'Write and schedule social media marketing posts on LinkedIn' },
  { phase: 2, week: 3, team: 'Operations',   role: 'operations', formatScope: 'physical', title: 'Settle physical venue contracts for {{venue}}' },
  { phase: 2, week: 3, team: 'Operations',   role: 'operations', formatScope: 'virtual',  title: 'Configure virtual platform hosting settings for Webinar' },
  { phase: 2, week: 3, team: 'Operations',   role: 'operations', formatScope: 'physical', title: 'Coordinate layouts for print assets (banners, standees, tent cards, badges) with Design' },
  { phase: 2, week: 3, team: 'Design',       role: 'design',     formatScope: 'both',     title: 'Begin working on asset files for the event' },

  // ── Phase 3 · Live Execution (12 tasks) ─────────────────────────────
  { phase: 3, week: 4, team: 'Delegate Team', role: 'delegate',  formatScope: 'both',     title: 'Compile the final list of registered delegates for screening and confirmation' },
  { phase: 3, week: 4, team: 'Design',       role: 'design',     formatScope: 'physical', title: 'Deliver print-ready asset files to Operations for production' },
  { phase: 3, week: 4, team: 'Delegate Team', role: 'delegate',  formatScope: 'both',     title: 'Send calendar invites and formal confirmation passes to registered delegates' },
  { phase: 3, week: 4, team: 'Delegate Team', role: 'delegate',  formatScope: 'both',     title: 'Run the 24-48 hour confirmation call campaign to prevent dropouts' },
  { phase: 3, week: 4, team: 'Delegate Team', role: 'delegate',  formatScope: 'both',     title: 'Send final reminders on the morning of the event' },
  { phase: 3, week: 4, team: 'Operations',   role: 'operations', formatScope: 'physical', title: 'Verify physical venue setup and catering layouts for {{venue}}' },
  { phase: 3, week: 4, team: 'Operations',   role: 'operations', formatScope: 'virtual',  title: 'Test digital host/panel settings for Webinar' },
  { phase: 3, week: 4, team: 'Operations',   role: 'operations', formatScope: 'both',     title: 'Perform technical AV checks and dry-runs with speakers and client' },
  { phase: 3, week: 5, team: 'Operations',   role: 'operations', formatScope: 'physical', title: 'Place print materials, banners, and set up the check-in desk onsite' },
  { phase: 3, week: 5, team: 'Operations',   role: 'operations', formatScope: 'physical', title: 'Open registration desk and manage delegate badges/check-in' },
  { phase: 3, week: 5, team: 'Production',   role: 'production', formatScope: 'both',     title: 'Manage agenda timeline and speaker transition cues' },
  { phase: 3, week: 5, team: 'Commercial',   role: 'commercial', formatScope: 'both',     title: 'Host the boardroom roundtable or moderate the webinar panel' },
  { phase: 3, week: 5, team: 'Operations',   role: 'operations', formatScope: 'physical', title: 'Manage event tear-down and secure physical materials post-event' },

  // ── Phase 4 · Reporting & Settlement (8 tasks) ──────────────────────
  { phase: 4, week: 6, team: 'Delegate Team', role: 'delegate',  formatScope: 'both',     title: 'Reconcile final check-ins and flag no-show delegates' },
  { phase: 4, week: 6, team: 'Delegate Team', role: 'delegate',  formatScope: 'both',     title: 'Compile detailed attendee analytics and registration source data' },
  { phase: 4, week: 6, team: 'Marketing',    role: 'marketing',  formatScope: 'both',     title: 'Generate the post-event report draft containing delegate metrics and survey responses' },
  { phase: 4, week: 6, team: 'Commercial',   role: 'commercial', formatScope: 'both',     title: "Review the post-event report against the client's KPIs (quotas, seniority parameters)" },
  { phase: 4, week: 6, team: 'Commercial',   role: 'commercial', formatScope: 'both',     title: 'Deliver the final post-event report to the client and schedule a review call' },
  { phase: 4, week: 6, team: 'Marketing',    role: 'marketing',  formatScope: 'both',     title: 'Coordinate with PR to distribute post-event press releases (if in scope)' },
  { phase: 4, week: 6, team: 'Marketing',    role: 'marketing',  formatScope: 'both',     title: 'Post event photo highlights and thank-you updates on LinkedIn' },
  { phase: 4, week: 6, team: 'Commercial',   role: 'commercial', formatScope: 'both',     title: 'Hold the client satisfaction review meeting' },
]

// Interpolate {{client}} and {{venue}} placeholders in a task title using
// the project's client_company + venue + city. Missing values are replaced
// with sensible defaults (e.g. "TBD venue") so the task title always reads
// cleanly to a user even when the project row is incomplete.
function interpolateTitle(title: string, project: { client_company?: string | null; venue?: string | null; city?: string | null }): string {
  const client = (project.client_company ?? '').trim() || 'the client'
  const venueParts = [project.venue, project.city].map(v => (v ?? '').trim()).filter(Boolean)
  const venue = venueParts.length ? venueParts.join(', ') : 'the venue (TBD)'
  return title.replace(/\{\{client\}\}/g, client).replace(/\{\{venue\}\}/g, venue)
}

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
      // Nic 2f002c2e — creator_id drives edit/delete permissions on the
      // Tasks tab. Falls back to body.created_by so a project retains the
      // creator identity even when session isn't available at POST time.
      creator_id: body.creator_id || body.created_by || null,
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
    // Nic 2f002c2e — interpolate {{client}}/{{venue}} placeholders using
    // the current project's client_company/venue/city.
    title: interpolateTitle(t.title, { client_company: body.client_company, venue: body.venue, city: body.city }),
    phase: t.phase,
    week_number: t.week,
    assigned_to: roleToLead[t.role] || null,
    assigned_role: t.role,
    // Canonical display team label (Delegate Team, not Delegacy). Column
    // added by supabase/bespoke_task_overhaul.sql — safe insert: if the
    // column doesn't yet exist in production, Supabase will reject with a
    // clear error and the 207 branch below surfaces it.
    assigned_team: t.team,
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
