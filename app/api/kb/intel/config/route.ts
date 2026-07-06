import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { isKbAdmin } from '@/app/lib/kb/intel-access'

/*
  GET /api/kb/intel/config — the singleton config row

  PATCH /api/kb/intel/config
  Body: { admin_staff_id, cron_schedule_display?, auto_publish_threshold?, review_threshold?, is_enabled?, event_registry_source? }
*/
export async function GET() {
  const { data, error } = await supabaseAdmin.from('kb_intel_config').select('*').limit(1).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { admin_staff_id, cron_schedule_display, auto_publish_threshold, review_threshold, is_enabled, event_registry_source } = body ?? {}

  if (!(await isKbAdmin(admin_staff_id))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  if (event_registry_source && event_registry_source !== 'tresconglobal') {
    const superAdmin = admin_staff_id === 'super-admin' ||
      (await supabaseAdmin.from('staff_members').select('job_level').eq('id', admin_staff_id).single()).data?.job_level === 'super_admin'
    if (!superAdmin) return NextResponse.json({ error: 'Only super admins can change the event registry source.' }, { status: 403 })
  }

  const { data: existing } = await supabaseAdmin.from('kb_intel_config').select('id').limit(1).single()
  if (!existing) return NextResponse.json({ error: 'Config row not found — run the intel migration first.' }, { status: 500 })

  const updates: Record<string, unknown> = {
    updated_by: admin_staff_id === 'super-admin' ? null : admin_staff_id,
    updated_at: new Date().toISOString(),
  }
  if (cron_schedule_display !== undefined) updates.cron_schedule_display = cron_schedule_display
  if (auto_publish_threshold !== undefined) updates.auto_publish_threshold = auto_publish_threshold
  if (review_threshold !== undefined)       updates.review_threshold = review_threshold
  if (is_enabled !== undefined)             updates.is_enabled = is_enabled
  if (event_registry_source !== undefined)  updates.event_registry_source = event_registry_source

  const { data, error } = await supabaseAdmin
    .from('kb_intel_config')
    .update(updates)
    .eq('id', existing.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, config: data })
}
