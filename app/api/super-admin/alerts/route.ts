import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireSuperAdmin } from '@/app/lib/access/super-admin'
import { ALERT_TYPES, alertTypeByKey } from '@/app/lib/alerts/types'

/* Super Admin only. GET: every alert type with its recipients. PUT { alert_type, recipients: [{ staff_id, email, bell }] }: replaces that type's recipient list.
   An empty list is allowed: the alert then goes to the Super Admin (see app/lib/alerts/send.ts). */

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if ('error' in gate) return gate.error
  const { data } = await supabaseAdmin.from('alert_recipients').select('alert_type, staff_id, email, bell')
  return NextResponse.json({
    types: ALERT_TYPES.map(t => ({ ...t, recipients: (data ?? []).filter(r => r.alert_type === t.key).map(r => ({ staff_id: r.staff_id, email: r.email, bell: r.bell })) })),
  })
}

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if ('error' in gate) return gate.error
  const body = await req.json().catch(() => null) as { alert_type?: string; recipients?: { staff_id?: string; email?: boolean; bell?: boolean }[] } | null
  if (!body?.alert_type || !alertTypeByKey(body.alert_type) || !Array.isArray(body.recipients)) return NextResponse.json({ error: 'alert_type and recipients[] required.' }, { status: 400 })
  const wanted = [...new Map(body.recipients.filter(r => typeof r.staff_id === 'string').map(r => [r.staff_id!, r])).values()]
  const { data: valid } = wanted.length ? await supabaseAdmin.from('staff_members').select('id').in('id', wanted.map(r => r.staff_id!)) : { data: [] as { id: string }[] }
  const ok = new Set((valid ?? []).map(v => v.id as string))
  const rows = wanted.filter(r => ok.has(r.staff_id!)).map(r => ({ alert_type: body.alert_type!, staff_id: r.staff_id!, email: r.email !== false, bell: r.bell !== false }))
  const del = await supabaseAdmin.from('alert_recipients').delete().eq('alert_type', body.alert_type)
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 })
  if (rows.length) { const ins = await supabaseAdmin.from('alert_recipients').insert(rows); if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 }) }
  return NextResponse.json({ ok: true, count: rows.length })
}
