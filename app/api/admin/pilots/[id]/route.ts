import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

const VALID_STATUSES = ['active', 'building', 'testing', 'complete', 'paused']

/* PATCH /api/admin/pilots/[id]
   Admin-session-only. Updates fields on an existing pilot project — this is
   what lets an admin fix a project's tool_href/tool_label after creation
   (the wizard's Tool Link fields are optional, so several projects were
   created with neither set, which is why their "Open Tool" button doesn't
   render at all).
   Body: any subset of { name, description, status, tool_href, tool_label, builder_id }
   Only keys present in the body are updated — omitting a key leaves it untouched.
*/
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { data: existing } = await supabaseAdmin.from('pilot_projects').select('id').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `Invalid status — must be one of ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }
  if (body.name !== undefined && !String(body.name).trim()) {
    return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (body.name !== undefined) update.name = String(body.name).trim()
  if (body.description !== undefined) update.description = body.description || null
  if (body.status !== undefined) update.status = body.status
  if (body.tool_href !== undefined) update.tool_href = body.tool_href || null
  if (body.tool_label !== undefined) update.tool_label = body.tool_label || null
  if (body.builder_id !== undefined) update.builder_id = body.builder_id || null

  if (!Object.keys(update).length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('pilot_projects')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ project: data })
}
