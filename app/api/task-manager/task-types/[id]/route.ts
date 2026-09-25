/** PATCH /api/task-manager/task-types/[id] — rename, activate/deactivate, or reorder (sort_order) */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { canAccessTaskManagerAdmin } from '../../_lib/access'
import { getSession as verifiedGetSession } from '@/app/lib/access/session'

function getSession(req: NextRequest) {
  // Signature-verified (2026-09-25 cookie sweep) — never decode tcs_session by hand.
  return verifiedGetSession(req)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!(await canAccessTaskManagerAdmin(session))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if ('label' in body && body.label?.trim()) updates.label = body.label.trim()
  if ('active' in body) updates.active = !!body.active
  if ('sort_order' in body && Number.isFinite(body.sort_order)) updates.sort_order = body.sort_order

  const { data, error } = await supabaseAdmin
    .from('task_manager_task_types')
    .update(updates)
    .eq('id', id)
    .select('id, label, sort_order, active')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
