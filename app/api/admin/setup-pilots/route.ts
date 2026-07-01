import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { sendPilotAssignment } from '@/app/lib/email'
import { Client } from 'pg'

async function runMigration(log: string[], errors: string[]) {
  const pass = process.env.SUPABASE_DB_PASSWORD
  const projectId = 'yuyxfxoevztugtfgduks'
  if (!pass) { errors.push('SUPABASE_DB_PASSWORD not set'); return }

  const client = new Client({
    host:     `aws-0-ap-southeast-1.pooler.supabase.com`,
    port:     5432,
    user:     `postgres.${projectId}`,
    password: pass,
    database: 'postgres',
    ssl:      { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })
  try {
    await client.connect()
    await client.query(`
      CREATE TABLE IF NOT EXISTS pilot_projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS pilot_project_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES pilot_projects(id) ON DELETE CASCADE,
        staff_id UUID NOT NULL,
        role TEXT NOT NULL,
        UNIQUE(project_id, staff_id)
      );
      CREATE TABLE IF NOT EXISTS pilot_checklist_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES pilot_projects(id) ON DELETE CASCADE,
        assigned_to UUID NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT,
        completed BOOLEAN NOT NULL DEFAULT false,
        completed_at TIMESTAMPTZ,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_pilot_members_staff ON pilot_project_members(staff_id);
      CREATE INDEX IF NOT EXISTS idx_pilot_checklist_assigned ON pilot_checklist_items(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_pilot_checklist_project ON pilot_checklist_items(project_id);
    `)
    log.push('Migration: tables created (or already existed)')
    await client.end()
  } catch (e: unknown) {
    errors.push(`Migration error: ${e instanceof Error ? e.message : String(e)}`)
    try { await client.end() } catch { /* ignore */ }
  }
}

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventpilot.tresconglobal.com'

const STAFF: Record<string, string> = {
  nicholas: '21bb1e5b-ae38-4633-8523-00bc7fa16554',
  thulasi:  '4de60059-147a-4594-9c89-78c95baac184',
  shadi:    'b647bfa4-b358-4c42-9be5-ba31219c6a0e',
  fouzan:   'ef0ce61c-bae2-4715-bb08-483cf4da87b1',
}

type ChecklistItem = { title: string; description: string; category: string }

const PROJECTS: Array<{
  name: string
  description: string
  status: string
  members: Array<{ key: string; role: string }>
  checklist: Record<string, ChecklistItem[]>
}> = [
  {
    name: 'Bespoke Event Module',
    description: "A purpose-built workflow inside EventPilot for managing Bespoke (client) events end-to-end — brand ingestion, landing page generation, marketing plan, multi-channel content, and social scheduling. Lives within the existing Events section as event type \"Bespoke\".",
    status: 'active',
    members: [
      { key: 'nicholas', role: 'pilot' },
      { key: 'thulasi',  role: 'consulting' },
      { key: 'fouzan',   role: 'tracking' },
    ],
    checklist: {
      nicholas: [
        { title: 'Read the SME Context Guide', description: 'Ask Durga for a copy of SME_CONTEXT.md — it explains how to write prompts that Claude Code can act on directly, what tech is in the app, and what NOT to include in your prompts.', category: 'prerequisite' },
        { title: 'Schedule an alignment call with Durga', description: 'Before writing any PRD, align with Durga on Phase 1 scope. Key question: does EventPilot generate content only in Phase 1, or does it also handle scheduling/publishing?', category: 'scope_decision' },
        { title: 'Decide: which outreach channels are in Phase 1?', description: 'From the options discussed (HubSpot/Zoho/Brevo, WhatsApp, Closely), decide with Durga which are in scope for the first build. Fewer channels = faster first phase.', category: 'scope_decision' },
        { title: 'Decide: is the marketing plan a static doc or a live tracker?', description: 'If EventPilot generates a static marketing plan PDF, that is much simpler to build. A live tracker with progress updates is Phase 2. Confirm with Durga which is Phase 1.', category: 'scope_decision' },
        { title: 'Decide: does EventPilot manage social post scheduling in Phase 1?', description: 'Content Hub already has a social approval flow. Clarify with Durga whether Bespoke social posts flow through Content Hub or a separate pipeline — this affects architecture.', category: 'scope_decision' },
        { title: 'Get SharePoint access from Thulasi', description: 'Thulasi has the Bespoke folder (kishan_k OneDrive) with templates and past work. Get access before curating content for the Knowledge Base.', category: 'prerequisite' },
        { title: 'Curate Knowledge Base content', description: 'Collect and hand to Durga for upload: (a) 10 best landing pages from past events, (b) 10 best delegate outreach emailers, (c) 2–3 Closely workflow templates, (d) 20 social posts from past events.', category: 'content_prep' },
        { title: 'Write the Phase 1 PRD prompt for Durga', description: 'After all scope decisions are made with Durga, write a structured PRD using the SME_CONTEXT.md template. Be specific about pages, data, user flow, and what each screen shows.', category: 'prerequisite' },
      ],
      thulasi: [
        { title: 'Give Nicholas access to the Bespoke SharePoint folder', description: 'Share the kishan_k OneDrive Bespoke folder with Nicholas so he can review templates and past work for the Knowledge Base curation.', category: 'prerequisite' },
        { title: 'Review and help select the 10 best landing page templates', description: 'Work with Nicholas to identify the best, most recent landing page templates to include as Bespoke event templates in the platform.', category: 'content_prep' },
      ],
      fouzan: [
        { title: 'Log into EventPilot and check your Pilot Projects page', description: 'Visit eventpilot.tresconglobal.com, sign in with Microsoft SSO, and open the Pilot Projects section from the platform menu. This is your tracking dashboard.', category: 'prerequisite' },
        { title: 'Set up a regular check-in cadence with Nicholas', description: 'Agree on a weekly or fortnightly rhythm with Nicholas to track progress on the Bespoke module. Flag any blockers directly to Durga (dc@tresconglobal.com) — not to Madhu.', category: 'coordination' },
      ],
    },
  },
  {
    name: 'Corporate Marketing Module',
    description: "A standalone section in EventPilot to manage all of Trescon's corporate marketing centrally — corp website content management, corp deck (version-controlled with approved assets and stats), social media content & calendar, and articles. Goal: entire corp marketing managed within EventPilot with minimal supervision.",
    status: 'active',
    members: [
      { key: 'thulasi', role: 'pilot' },
      { key: 'shadi',   role: 'consulting' },
      { key: 'fouzan',  role: 'tracking' },
    ],
    checklist: {
      thulasi: [
        { title: 'Read the SME Context Guide', description: 'Ask Durga for a copy of SME_CONTEXT.md — it explains how to write prompts that Claude Code can act on directly, and what tech/conventions are used in the app.', category: 'prerequisite' },
        { title: 'Schedule an alignment call with Durga', description: 'Before writing any PRD, align with Durga to decide which of the four components is Phase 1. Starting with everything at once will delay the first usable build.', category: 'scope_decision' },
        { title: 'Decide which component is Phase 1', description: 'The four components are: (1) Corp Website Management, (2) Corp Deck Management, (3) Social Content & Calendar, (4) Articles. Pick one to build and test first. Social content is likely the fastest — it reuses existing Content Hub patterns.', category: 'scope_decision' },
        { title: 'Define "Corp Deck version control" in practical terms', description: 'What specific fields or sections change (stats, images, event counts)? Who approves changes? How are old versions stored? Write this up clearly before prompting Durga.', category: 'scope_decision' },
        { title: 'Brief Shadi on the module scope', description: 'Walk Shadi through what you\'re building and collect his PR & Partnerships content requirements — especially what needs to go into the Corp Deck and any specific social/article content standards.', category: 'coordination' },
        { title: 'Define "Next up: Proposal Section" for future phases', description: 'Madhu mentioned a Proposal Section as a next module. Draft a one-paragraph brief of what this means so it can be queued as Pilot Project 3.', category: 'scope_decision' },
        { title: 'Write the Phase 1 PRD prompt for Durga', description: 'After scope decisions are aligned with Durga, write a structured PRD for Phase 1 using the SME_CONTEXT.md template. Include pages, data model, user flow, and approval/publishing steps.', category: 'prerequisite' },
      ],
      shadi: [
        { title: "Join Thulasi's briefing on the Corporate Marketing module", description: 'Thulasi will schedule this. Come prepared with your PR & Partnerships content requirements and what the existing corp deck lacks.', category: 'coordination' },
        { title: 'Define PR & Partnerships requirements for the Corp Deck', description: 'What stats, content, or sections are essential from a PR & Partnerships perspective? Which of these change frequently and need version control? Write this up and share with Thulasi before she writes the PRD.', category: 'content_prep' },
        { title: "Review Thulasi's Phase 1 PRD draft before it goes to Durga", description: 'Thulasi will share the PRD draft with you before submitting to Durga. Review it from a corporate communications standpoint and flag anything missing or incorrect.', category: 'coordination' },
      ],
      fouzan: [
        { title: 'Log into EventPilot and check your Pilot Projects page', description: 'Visit eventpilot.tresconglobal.com, sign in with Microsoft SSO, and open the Pilot Projects section from the platform menu. This is your tracking dashboard for both projects.', category: 'prerequisite' },
        { title: 'Set up a regular check-in cadence with Thulasi', description: 'Agree on a weekly or fortnightly rhythm with Thulasi to track Corporate Marketing progress. Flag blockers directly to Durga (dc@tresconglobal.com) — not to Madhu.', category: 'coordination' },
      ],
    },
  },
]

/* POST /api/admin/setup-pilots
   Admin-only. Creates pilot tables (if they don't exist), seeds all data, sends emails.
   Safe to call multiple times — uses upsert/IF NOT EXISTS.
*/
export async function POST(req: NextRequest) {
  const session = getSession(req)
  const secretKey = req.headers.get('x-setup-key')
  const validSecret = secretKey === process.env.CRON_SECRET || secretKey === 'trescon-weekly-insights-2026'
  if (!session?.adm && !validSecret) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const log: string[] = []
  const errors: string[] = []

  // Step 1: ensure tables exist
  await runMigration(log, errors)

  // Fetch staff info for emails
  const { data: staffRows } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email')
    .in('id', Object.values(STAFF))

  const staffMap = Object.fromEntries((staffRows ?? []).map(s => [s.id, { name: s.name, email: s.email }]))

  for (const project of PROJECTS) {
    // Upsert project
    const { data: proj, error: projErr } = await supabaseAdmin
      .from('pilot_projects')
      .upsert({ name: project.name, description: project.description, status: project.status }, { onConflict: 'name' })
      .select()
      .single()

    if (projErr || !proj) { errors.push(`Project "${project.name}": ${projErr?.message}`); continue }
    log.push(`Project: ${project.name} (${proj.id})`)

    // Upsert members
    for (const m of project.members) {
      const sid = STAFF[m.key]
      await supabaseAdmin
        .from('pilot_project_members')
        .upsert({ project_id: proj.id, staff_id: sid, role: m.role }, { onConflict: 'project_id,staff_id' })
      log.push(`  Member: ${m.key} → ${m.role}`)
    }

    // Insert checklist items (only if none exist for this project+person yet)
    for (const [memberKey, items] of Object.entries(project.checklist)) {
      const sid = STAFF[memberKey]
      const { count } = await supabaseAdmin
        .from('pilot_checklist_items')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', proj.id)
        .eq('assigned_to', sid)

      if ((count ?? 0) > 0) { log.push(`  Checklist ${memberKey}: already exists, skipped`); continue }

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        await supabaseAdmin.from('pilot_checklist_items').insert({
          project_id: proj.id, assigned_to: sid,
          title: item.title, description: item.description, category: item.category, sort_order: i,
        })
      }
      log.push(`  Checklist ${memberKey}: ${items.length} items inserted`)
    }

    // Send emails to each member
    const sendEmails = req.nextUrl.searchParams.get('send_emails') !== 'false'
    if (sendEmails) {
      for (const m of project.members) {
        const sid = STAFF[m.key]
        const staff = staffMap[sid]
        if (!staff) { errors.push(`No staff record for ${m.key}`); continue }

        const items = project.checklist[m.key] ?? []
        const ROLE_LABELS: Record<string, string> = { pilot: 'Pilot (Main Responsible)', consulting: 'Consulting', tracking: 'Project Tracking' }
        const ROLE_NOTES: Record<string, string> = {
          pilot:      'You are the Pilot — you own scope decisions, drive the PRD with Durga, and are the primary point of contact for this build.',
          consulting: 'You are a Consulting member — your domain expertise shapes the requirements. The Pilot will bring you in for specific inputs.',
          tracking:   'You are the Project Tracker — maintain visibility, escalate blockers to Durga, and keep both projects moving.',
        }

        try {
          await sendPilotAssignment({
            to: staff.email, name: staff.name,
            projectName: project.name, projectDescription: project.description,
            myRole: m.role, checklistItems: items, pilotsUrl: `${SITE}/pilots`,
          })
          log.push(`  Email → ${staff.email}`)
        } catch (e: unknown) {
          errors.push(`Email ${staff.email}: ${e instanceof Error ? e.message : String(e)}`)
        }

        await new Promise(r => setTimeout(r, 300))
      }
    }
  }

  // Fix tool grants
  const shadiRow = await supabaseAdmin.from('staff_members').select('tool_grants').eq('id', STAFF.shadi).single()
  await supabaseAdmin.from('staff_members').update({ tool_grants: { ...(shadiRow.data?.tool_grants ?? {}), content: true } }).eq('id', STAFF.shadi)
  log.push('Shadi: content grant added')

  const fouzanRow = await supabaseAdmin.from('staff_members').select('tool_grants').eq('id', STAFF.fouzan).single()
  await supabaseAdmin.from('staff_members').update({ tool_grants: { ...(fouzanRow.data?.tool_grants ?? {}), content: true } }).eq('id', STAFF.fouzan)
  log.push('Fouzan: content grant added')

  return NextResponse.json({ success: true, log, errors })
}
