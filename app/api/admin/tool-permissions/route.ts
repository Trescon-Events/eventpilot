import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireAdmin } from '@/app/lib/access/require-admin'


/*
  GET /api/admin/tool-permissions?id=X
  Returns { tool_grants: Record<string,boolean>, toolkit_access: boolean }

  PATCH /api/admin/tool-permissions
  Body: { id, tool_key, value }
  Toggles a single tool grant. If tool_key === 'smart_data' also syncs toolkit_access.
*/

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const denied = requireAdmin(req)
  if (denied) return denied

  const { data, error } = await supabaseAdmin
    .from('staff_members')
    .select('tool_grants, toolkit_access')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tool_grants: data?.tool_grants ?? {}, toolkit_access: data?.toolkit_access ?? false })
}

export async function PATCH(req: NextRequest) {
  // Admin session only, signature-verified (2026-09-25). This used to decode the cookie by hand
  // WITHOUT checking its signature and also accepted a shared admin_code.
  const denied = requireAdmin(req)
  if (denied) return denied
  const body = await req.json().catch(() => ({}))
  const { id, tool_key, value } = body

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
