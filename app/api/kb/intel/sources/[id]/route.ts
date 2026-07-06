import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { isKbAdmin } from '@/app/lib/kb/intel-access'

/*
  PATCH /api/kb/intel/sources/[id]
  Body: { admin_staff_id, name?, config?, crawl_frequency?, crawl_behaviour?, is_active? }

  DELETE /api/kb/intel/sources/[id]?admin_staff_id=uuid
  Soft-deletes (is_active: false) if any kb_intel_items reference it, hard-deletes otherwise.
*/
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  const { admin_staff_id, name, config, crawl_frequency, crawl_behaviour, is_active } = body ?? {}

  if (!(await isKbAdmin(admin_staff_id))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined)            updates.name = name.trim()
  if (config !== undefined)          updates.config = config
  if (crawl_frequency !== undefined) updates.crawl_frequency = crawl_frequency
  if (crawl_behaviour !== undefined) updates.crawl_behaviour = crawl_behaviour
  if (is_active !== undefined)       updates.is_active = is_active

  const { data, error } = await supabaseAdmin
    .from('kb_intel_sources')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, source: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const adminStaffId = req.nextUrl.searchParams.get('admin_staff_id')

  if (!(await isKbAdmin(adminStaffId))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { count } = await supabaseAdmin
    .from('kb_intel_items')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', id)

  if (count && count > 0) {
    await supabaseAdmin.from('kb_intel_sources').update({ is_active: false }).eq('id', id)
    return NextResponse.json({ success: true, soft_deleted: true })
  }

  await supabaseAdmin.from('kb_intel_sources').delete().eq('id', id)
  return NextResponse.json({ success: true, soft_deleted: false })
}
