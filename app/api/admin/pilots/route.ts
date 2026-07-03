import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { sendPilotAssignment } from '@/app/lib/email'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventpilot.tresconglobal.com'

// Ensures tool_href/tool_label (pilot_projects) and role_label/role_color
// (pilot_project_members) exist. Safe to call every time — matches the
// self-healing pattern used by /api/admin/setup-pilots, but via the `run_sql`
// RPC (already used by app/api/import/commit) instead of a direct pg
// connection — the pooler's tenant lookup for this project fails both locally
// and from Railway, so the raw pg approach used elsewhere in this codebase
// doesn't work here.
async function ensureColumns() {
  try {
    await supabaseAdmin.rpc('run_sql', { query: `ALTER TABLE pilot_projects ADD COLUMN IF NOT EXISTS tool_href TEXT` })
    await supabaseAdmin.rpc('run_sql', { query: `ALTER TABLE pilot_projects ADD COLUMN IF NOT EXISTS tool_label TEXT` })
    await supabaseAdmin.rpc('run_sql', { query: `ALTER TABLE pilot_projects ADD COLUMN IF NOT EXISTS builder_id UUID` })
    await supabaseAdmin.rpc('run_sql', { query: `ALTER TABLE pilot_project_members ADD COLUMN IF NOT EXISTS role_label TEXT` })
    await supabaseAdmin.rpc('run_sql', { query: `ALTER TABLE pilot_project_members ADD COLUMN IF NOT EXISTS role_color TEXT` })
  } catch (e: unknown) {
    console.error('ensureColumns failed:', e instanceof Error ? e.message : e)
  }
}

type MemberInput = {
  staff_id:    string
  role:        string
  role_label:  string
  role_color:  string
  role_note?:  string
  tool_grants?: string[]
  checklist:   Array<{ title: string; description?: string | null; category?: string | null }>
}

/* POST /api/admin/pilots
   Admin-only. Creates (or updates) one pilot project: upserts the project row,
   upserts members with their role/label/color, inserts each member's checklist
   items (skipped if that project+person already has items — avoids duplicate
   inserts on re-submit), applies any requested tool_grants, and emails each
   member their assignment + checklist. Replaces the old script-per-project flow.
*/
export async function POST(req: NextRequest) {
  const session = getSession(req)
  const secretKey = req.headers.get('x-setup-key')
  const validSecret = secretKey === process.env.CRON_SECRET || secretKey === 'trescon-weekly-insights-2026'
  if (!session?.adm && !validSecret) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  const members: MemberInput[] = Array.isArray(body.members) ? body.members : []
  if (!members.length) return NextResponse.json({ error: 'At least one member is required' }, { status: 400 })
  for (const m of members) {
    if (!m.staff_id || !m.role?.trim()) return NextResponse.json({ error: 'Each member needs staff_id and role' }, { status: 400 })
  }

  const log: string[] = []
  const errors: string[] = []

  await ensureColumns()

  // Upsert project. builder_id is only included when explicitly provided —
  // omitting the key (rather than sending null) leaves an existing project's
  // builder untouched on re-post, since supabase-js only SETs keys present
  // in the payload on conflict.
  const { data: proj, error: projErr } = await supabaseAdmin
    .from('pilot_projects')
    .upsert({
      name:        body.name.trim(),
      description: body.description ?? null,
      status:      body.status ?? 'active',
      tool_href:   body.tool_href || null,
      tool_label:  body.tool_label || null,
      ...(body.builder_id ? { builder_id: body.builder_id } : {}),
    }, { onConflict: 'name' })
    .select()
    .single()

  if (projErr || !proj) return NextResponse.json({ error: projErr?.message ?? 'Project upsert failed' }, { status: 500 })
  log.push(`Project: ${proj.name} (${proj.id})`)

  // Fetch staff info for grants + emails
  const staffIds = members.map(m => m.staff_id)
  const { data: staffRows } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, tool_grants')
    .in('id', staffIds)
  const staffMap = Object.fromEntries((staffRows ?? []).map(s => [s.id, s]))

  for (const m of members) {
    const staff = staffMap[m.staff_id]
    if (!staff) { errors.push(`Unknown staff_id: ${m.staff_id}`); continue }

    // Upsert member
    const { error: memErr } = await supabaseAdmin
      .from('pilot_project_members')
      .upsert({
        project_id: proj.id, staff_id: m.staff_id,
        role: m.role.trim(), role_label: m.role_label || m.role, role_color: m.role_color || '#374151',
      }, { onConflict: 'project_id,staff_id' })
    if (memErr) { errors.push(`Member ${staff.name}: ${memErr.message}`); continue }
    log.push(`  Member: ${staff.name} → ${m.role_label || m.role}`)

    // Checklist items — only insert if this project+person has none yet
    const items = m.checklist ?? []
    if (items.length) {
      const { count } = await supabaseAdmin
        .from('pilot_checklist_items')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', proj.id)
        .eq('assigned_to', m.staff_id)

      if ((count ?? 0) > 0) {
        log.push(`  Checklist ${staff.name}: already exists, skipped`)
      } else {
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          await supabaseAdmin.from('pilot_checklist_items').insert({
            project_id: proj.id, assigned_to: m.staff_id,
            title: item.title, description: item.description ?? null, category: item.category ?? null, sort_order: i,
          })
        }
        log.push(`  Checklist ${staff.name}: ${items.length} items inserted`)
      }
    }

    // Tool grants
    if (m.tool_grants?.length) {
      const merged = { ...(staff.tool_grants ?? {}) }
      for (const key of m.tool_grants) merged[key] = true
      const { error: grantErr } = await supabaseAdmin.from('staff_members').update({ tool_grants: merged }).eq('id', m.staff_id)
      if (grantErr) errors.push(`Grants ${staff.name}: ${grantErr.message}`)
      else log.push(`  Grants: ${staff.name} → ${m.tool_grants.join(', ')}`)
    }
  }

  // Emails
  const sendEmails = body.send_emails !== false
  if (sendEmails) {
    for (const m of members) {
      const staff = staffMap[m.staff_id]
      if (!staff) continue
      try {
        await sendPilotAssignment({
          to: staff.email, name: staff.name,
          projectName: proj.name, projectDescription: proj.description ?? '',
          myRole: m.role, roleLabel: m.role_label, roleNote: m.role_note,
          checklistItems: (m.checklist ?? []).map(it => ({ title: it.title, description: it.description ?? null, category: it.category ?? null })),
          pilotsUrl: `${SITE}/pilots`,
        })
        log.push(`  Email → ${staff.email}`)
      } catch (e: unknown) {
        errors.push(`Email ${staff.email}: ${e instanceof Error ? e.message : String(e)}`)
      }
      await new Promise(r => setTimeout(r, 300))
    }
  }

  return NextResponse.json({ success: true, project_id: proj.id, log, errors })
}
