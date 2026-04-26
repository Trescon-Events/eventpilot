import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  GET /api/documents/list
  Query params:
    - staff_id: uuid  (returns all-staff docs + docs for events this person is assigned to)
    - type: filter by type (optional)
    - admin: '1' to return all documents (admin view)
*/
export async function GET(req: NextRequest) {
  const staffId = req.nextUrl.searchParams.get('staff_id')
  const admin   = req.nextUrl.searchParams.get('admin') === '1'
  const type    = req.nextUrl.searchParams.get('type')

  try {
    if (admin) {
      // Admin gets everything
      let q = supabaseAdmin
        .from('documents')
        .select('id, title, type, visibility, word_count, event_id, created_at, events(name)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
      if (type) q = q.eq('type', type)
      const { data, error } = await q
      if (error) throw error
      return NextResponse.json(data ?? [])
    }

    if (!staffId) {
      return NextResponse.json({ error: 'staff_id required' }, { status: 400 })
    }

    // Get event IDs this staff member is assigned to
    const { data: assignments } = await supabaseAdmin
      .from('event_staff')
      .select('event_id')
      .eq('staff_id', staffId)

    const assignedEventIds = (assignments ?? []).map(a => a.event_id)

    // Get docs visible to all + docs for events they are assigned to
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('id, title, type, visibility, word_count, event_id, created_at, events(name)')
      .eq('is_active', true)
      .or(
        assignedEventIds.length > 0
          ? `visibility.eq.all,event_id.in.(${assignedEventIds.join(',')})`
          : 'visibility.eq.all'
      )
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    console.error('documents list error:', e)
    return NextResponse.json([], { status: 500 })
  }
}

/* DELETE /api/documents/list?id=uuid — soft delete */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('documents').update({ is_active: false }).eq('id', id)
  return NextResponse.json({ success: true })
}
