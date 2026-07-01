import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

/* PATCH /api/pilots/checklist/[id]  — toggle complete/incomplete */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { completed } = await req.json().catch(() => ({}))

  // Verify the item belongs to this user (or they are admin)
  const { data: item } = await supabaseAdmin
    .from('pilot_checklist_items')
    .select('assigned_to')
    .eq('id', id)
    .single()

  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (!session.adm && item.assigned_to !== session.sid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('pilot_checklist_items')
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
