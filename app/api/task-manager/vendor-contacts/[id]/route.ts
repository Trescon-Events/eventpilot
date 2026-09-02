/** PATCH /api/task-manager/vendor-contacts/[id] — rename or activate/deactivate a vendor contact */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { canAccessTaskManagerAdmin } from '../../_lib/access'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean; vt?: boolean } }
  catch { return null }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!(await canAccessTaskManagerAdmin(session))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if ('name' in body && body.name?.trim()) updates.name = body.name.trim()
  if ('active' in body) updates.active = !!body.active

  const { data, error } = await supabaseAdmin
    .from('vendor_contacts')
    .update(updates)
    .eq('id', id)
    .select('id, vendor_staff_id, name, active')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
