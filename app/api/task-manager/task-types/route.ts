/**
 * GET  /api/task-manager/task-types — list task types, ordered by sort_order
 * POST /api/task-manager/task-types — add a task type
 *
 * Task Manager Admin Console territory (Khalifa's) — see
 * app/admin/task-manager/console/task-types/page.tsx. Readable by anyone
 * who can use the base module (TaskModal's required Task Type dropdown
 * needs the list); adding one (POST) stays admin-only, same GET-open /
 * write-admin-only split as vendor-contacts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { canAccessTaskManager, canAccessTaskManagerAdmin } from '../_lib/access'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean; vt?: boolean } }
  catch { return null }
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!(await canAccessTaskManager(session))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('task_manager_task_types')
    .select('id, label, sort_order, active')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!(await canAccessTaskManagerAdmin(session))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.label?.trim()) return NextResponse.json({ error: 'label is required' }, { status: 400 })

  const { data: last } = await supabaseAdmin
    .from('task_manager_task_types')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSortOrder = (last?.sort_order ?? -1) + 1

  const { data, error } = await supabaseAdmin
    .from('task_manager_task_types')
    .insert({ label: body.label.trim(), sort_order: nextSortOrder })
    .select('id, label, sort_order, active')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
