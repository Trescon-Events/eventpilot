/**
 * POST /api/access-request
 *
 * Called from /no-access when a staff member clicks "Request access" for a
 * tool they don't currently have permission to use.
 *
 * Two-track behaviour:
 *   1. Persists the request to `access_requests` so admins can act on it
 *      from the /admin/access-requests dashboard.
 *   2. Sends an email to Durga (same as before) so nothing's missed.
 *
 * Body: { tool: string, from?: string }
 * Auth: session cookie required.
 *
 * De-dup rules:
 *   - Only one PENDING row per (staff_id, tool_key) — repeated clicks bump
 *     requested_at + from_path on the existing row, they don't create a
 *     new dashboard entry.
 *   - Email fires at most once per 24h per (staff, tool) via an in-process
 *     cache. Worst case on a server restart is one extra email.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { sendToolAccessRequest } from '@/app/lib/email'
import { GRANT_STRATEGY, labelFor } from '@/app/lib/access-requests/grant-map'

const recentEmails = new Map<string, number>()
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let session: { sid?: string; adm?: boolean } | null = null
  try { session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch {}
  if (!session?.sid) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const toolKey = String(body?.tool ?? '').trim()
  const fromPath = body?.from ? String(body.from).slice(0, 200) : null
  if (!toolKey) return NextResponse.json({ error: 'tool required' }, { status: 400 })
  if (!GRANT_STRATEGY[toolKey]) {
    // Unknown key — accept anyway (an admin can still handle it manually),
    // but don't loop the caller into a 400 that hides an unusual request.
  }
  const label = labelFor(toolKey)

  // Look up requester
  const { data: staff } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, role, department')
    .eq('id', session.sid)
    .single()
  if (!staff?.email) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  // Upsert the pending row. A pending row for (staff, tool) already
  // existing means the user has clicked before and nothing's been done
  // yet — bump requested_at + from_path and move on.
  const { data: existing } = await supabaseAdmin
    .from('access_requests')
    .select('id')
    .eq('staff_id', staff.id)
    .eq('tool_key', toolKey)
    .eq('status', 'pending')
    .maybeSingle()
  if (existing) {
    await supabaseAdmin
      .from('access_requests')
      .update({ requested_at: new Date().toISOString(), from_path: fromPath })
      .eq('id', existing.id)
  } else {
    await supabaseAdmin
      .from('access_requests')
      .insert({ staff_id: staff.id, tool_key: toolKey, from_path: fromPath })
  }

  // Email — dedup 24h per (staff, tool). Worst case: extra email after restart.
  const dedupeKey = `${staff.id}::${toolKey}`
  const last = recentEmails.get(dedupeKey)
  if (last && Date.now() - last < DEDUPE_WINDOW_MS) {
    return NextResponse.json({ ok: true, deduped: true })
  }

  try {
    await sendToolAccessRequest({
      staffName:  staff.name || staff.email,
      staffEmail: staff.email,
      staffRole:  staff.role ?? null,
      staffDept:  staff.department ?? null,
      tool:       label,
      toolKey,
      fromPath,
    })
    recentEmails.set(dedupeKey, Date.now())
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('access-request email failed', err)
    // Request row is already persisted — return ok so the UI can proceed
    return NextResponse.json({ ok: true, email_failed: true })
  }
}
