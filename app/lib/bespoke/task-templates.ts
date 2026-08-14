/**
 * 43-task SOP blueprint for bespoke projects — Nic build_request 2f002c2e.
 *
 * Extracted from app/api/bespoke/route.ts so both the create-project route
 * (POST /api/bespoke) AND the retroactive re-seed route (POST /api/bespoke/tasks/reseed
 * — Nic 09390aeb) share the same task list, interpolation, and due-date logic.
 *
 * formatScope filters templates by project.format:
 *   'both'     — always seeded
 *   'physical' — seeded only when project.format is physical or hybrid
 *   'virtual'  — seeded only when project.format is virtual (webinar)
 *
 * team is the canonical display label (Delegate Team, not Delegacy) written
 * to bespoke_tasks.assigned_team. role is the lowercase key used for the
 * existing assigned_role column + role→lead FK mapping.
 *
 * title supports {{client}} and {{venue}} placeholders — interpolated at
 * seed time via interpolateTitle().
 */

export type TaskTeam =
  | 'Commercial' | 'Marketing' | 'Delegate Team' | 'Operations'
  | 'Design' | 'Production' | 'DRT' | 'Client' | 'All Teams'

export type TaskTemplate = {
  phase:       number
  week:        number
  role:        string
  team:        TaskTeam
  title:       string
  formatScope: 'physical' | 'virtual' | 'both'
}

/** Team → canonical role key for the assigned_role column. */
export const TEAM_TO_ROLE: Record<TaskTeam, string> = {
  Commercial:      'commercial',
  Marketing:       'marketing',
  'Delegate Team': 'delegate',
  Operations:      'operations',
  Design:          'design',
  Production:      'production',
  DRT:             'marketing',      // DRT reports up to marketing per current lead model
  Client:          'commercial',     // Client tasks tracked by commercial lead
  'All Teams':     'commercial',     // Kickoff-style ownership defaults to commercial
}

export const TASK_TEMPLATES: TaskTemplate[] = [
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

/**
 * Interpolate {{client}} and {{venue}} placeholders in a task title using
 * the project's client_company + venue + city. Missing values fall back to
 * sensible defaults so titles always read cleanly.
 */
export function interpolateTitle(
  title: string,
  project: { client_company?: string | null; venue?: string | null; city?: string | null },
): string {
  const client = (project.client_company ?? '').trim() || 'the client'
  const venueParts = [project.venue, project.city].map(v => (v ?? '').trim()).filter(Boolean)
  const venue = venueParts.length ? venueParts.join(', ') : 'the venue (TBD)'
  return title.replace(/\{\{client\}\}/g, client).replace(/\{\{venue\}\}/g, venue)
}

/**
 * Runway-proportional due-date calculator.
 *   Phase 1: 0.00 → 0.15 of runway (contract → event)
 *   Phase 2: 0.15 → 0.83
 *   Phase 3: 0.83 → 1.00
 *   Phase 4: fixed offset — eventDate + 10 days
 * Within phases 1/2/3, distinct week numbers in that phase are spaced
 * evenly across the phase range.
 */
export function calculateDueDate(
  contractSignedDate: string | null,
  eventDate:          string | null,
  phase:              number,
  weekNumber:         number | null,
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

  const weeksInPhase = Array.from(
    new Set(TASK_TEMPLATES.filter(t => t.phase === phase).map(t => t.week)),
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
      const pos = (idx + 1) / (weeksInPhase.length + 1)
      fraction = rStart + pos * (rEnd - rStart)
    }
  }

  const offsetDays = Math.round(runwayDays * fraction)
  const d = new Date(contractSignedDate)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]
}

/**
 * Build the ready-to-insert bespoke_tasks rows for a project.
 * Used by both the create-project POST and the retroactive re-seed POST.
 */
export function buildTasksForProject(project: {
  id:                    string
  client_company?:       string | null
  venue?:                string | null
  city?:                 string | null
  format?:               'physical' | 'virtual' | 'hybrid' | null
  contract_signed_date?: string | null
  event_date?:           string | null
  commercial_lead_id?:   string | null
  marketing_lead_id?:    string | null
  delegate_lead_id?:     string | null
  operations_lead_id?:   string | null
  design_lead_id?:       string | null
  production_advisor_id?:string | null
}) {
  const roleToLead: Record<string, string | null> = {
    commercial: project.commercial_lead_id  ?? null,
    marketing:  project.marketing_lead_id   ?? null,
    delegate:   project.delegate_lead_id    ?? null,
    operations: project.operations_lead_id  ?? null,
    design:     project.design_lead_id      ?? null,
    production: project.production_advisor_id ?? null,
  }

  const projectFormat = project.format ?? 'physical'
  const applicableTemplates = TASK_TEMPLATES.filter(t => {
    if (t.formatScope === 'both') return true
    if (projectFormat === 'virtual') return t.formatScope === 'virtual'
    return t.formatScope === 'physical'
  })

  return applicableTemplates.map((t, i) => ({
    project_id:    project.id,
    title:         interpolateTitle(t.title, project),
    phase:         t.phase,
    week_number:   t.week,
    assigned_to:   roleToLead[t.role] ?? null,
    assigned_role: t.role,
    assigned_team: t.team,
    due_date:      calculateDueDate(project.contract_signed_date ?? null, project.event_date ?? null, t.phase, t.week),
    status:        'pending',
    sort_order:    i,
  }))
}
