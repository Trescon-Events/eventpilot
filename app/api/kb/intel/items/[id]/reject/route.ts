import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { isKbAdmin } from '@/app/lib/kb/intel-access'

/*
  POST /api/kb/intel/items/[id]/reject
  Body: { admin_staff_id }
*/
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { admin_staff_id } = await req.json().catch(() => ({}))

  if (!(await isKbAdmin(admin_staff_id))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: item, error: itemErr } = await supabaseAdmin
    .from('kb_intel_items')
    .select('id, status')
    .eq('id', id)
    .single()

  if (itemErr || !item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (item.status !== 'pending') return NextResponse.json({ error: `Item is already ${item.status}` }, { status: 409 })

  const { data, error } = await supabaseAdmin
    .from('kb_intel_items')
    .update({
      status: 'rejected',
      reviewed_by: admin_staff_id === 'super-admin' ? null : admin_staff_id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, item: data })
}
