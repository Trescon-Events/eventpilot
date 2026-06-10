import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026'

/*
  GET /api/admin/tool-permissions?id=X
  Returns { tool_grants: Record<string,boolean>, toolkit_access: boolean }

  PATCH /api/admin/tool-permissions
  Body: { admin_code, id, tool_key, value }
  Toggles a single tool grant. If tool_key === 'smart_data' also syncs toolkit_access.
*/

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  let session: { adm?: boolean } | null = null
  try { session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch {}
  if (!session?.adm) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('staff_members')
    .select('tool_grants, toolkit_access')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tool_grants: data?.tool_grants ?? {}, toolkit_access: data?.toolkit_access ?? false })
}

export async function PATCH(req: NextRequest) {
  // Accept either session auth (admin) or admin_code (for server-side calls)
  const body = await req.json().catch(() => ({}))
  const { id, tool_key, value } = body

  const raw = req.cookies.get('tcs_session')?.value
  let isAdmin = false
  if (raw) {
    try {
      const session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
      isAdmin = session?.adm === true
    } catch {}
  }
  if (!isAdmin && body.admin_code !== ADMIN_CODE) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  if (!id || !tool_key || typeof value !== 'boolean') {
    return NextResponse.json({ error: 'id, tool_key, and value required' }, { status: 400 })
  }

  // Fetch current tool_grants
  const { data: current, error: fetchErr } = await supabaseAdmin
    .from('staff_members')
    .select('tool_grants')
    .eq('id', id)
    .single()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  const grants: Record<string, boolean> = { ...(current?.tool_grants ?? {}), [tool_key]: value }

  const updates: Record<string, unknown> = { tool_grants: grants }
  // Smart Data syncs to toolkit_access for backward compat
  if (tool_key === 'smart_data') updates.toolkit_access = value

  const { error: updateErr } = await supabaseAdmin
    .from('staff_members')
    .update(updates)
    .eq('id', id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, grants })
}
