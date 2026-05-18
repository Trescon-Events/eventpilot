import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?open=true          — all open/acknowledged alerts (HR dashboard)
// GET  ?staff_id=X         — alerts for a specific staff member
// GET  ?type=X             — filter by alert type
// POST                     — create an alert (manual or system-triggered)
// PATCH { id, status }     — acknowledge or resolve an alert
// POST ?run_checks=true    — run automated alert generation (cron-style)

const ALERT_TYPES = [
  'probation_ending',
  'contract_expiring',
  'leave_balance_low',
  'certificate_expiring',
  'onboarding_overdue',
  'offboarding_overdue',
  'training_overdue',
  'birthday',
  'work_anniversary',
  'custom',
] as const

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const staff_id = searchParams.get('staff_id')
  const type     = searchParams.get('type')
  const open     = searchParams.get('open') === 'true'

  let query = supabaseAdmin
    .from('hr_alerts')
    .select(`
      *,
      staff:staff_id ( id, name, department )
    `)
    .order('due_date', { ascending: true, nullsFirst: false })

  if (staff_id) query = query.eq('staff_id', staff_id)
  if (type)     query = query.eq('type', type)
  if (open)     query = query.in('status', ['open', 'acknowledged'])

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  // Automated alert generation
  if (searchParams.get('run_checks') === 'true') {
    return runAlertChecks()
  }

  const body = await req.json()
  const { staff_id, type, title, body: alertBody, due_date, metadata } = body

  if (!staff_id || !type || !title) {
    return NextResponse.json({ error: 'staff_id, type, and title required' }, { status: 400 })
  }
  if (!ALERT_TYPES.includes(type as typeof ALERT_TYPES[number])) {
    return NextResponse.json({ error: `Invalid alert type. Must be one of: ${ALERT_TYPES.join(', ')}` }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('hr_alerts')
    .insert({
      staff_id,
      type,
      title,
      body:     alertBody ?? null,
      due_date: due_date  ?? null,
      metadata: metadata  ?? null,
      status:   'open',
    })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, status, resolved_note } = await req.json()
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })

  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (resolved_note) patch.resolved_note = resolved_note
  if (status === 'resolved') patch.resolved_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('hr_alerts')
    .update(patch)
    .eq('id', id)
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ---------------------------------------------------------------------------
// Automated checks — run daily (or on demand)
// ---------------------------------------------------------------------------
async function runAlertChecks() {
  const today    = new Date()
  const in30days = new Date(today); in30days.setDate(today.getDate() + 30)
  const in7days  = new Date(today); in7days.setDate(today.getDate() + 7)
  const todayStr    = today.toISOString().slice(0, 10)
  const in30Str     = in30days.toISOString().slice(0, 10)
  const in7Str      = in7days.toISOString().slice(0, 10)

  const created: string[] = []

  // 1. Contracts expiring within 30 days
  const { data: expiringContracts } = await supabaseAdmin
    .from('staff_contracts')
    .select('id, staff_id, contract_end_date')
    .eq('employment_status', 'active')
    .not('contract_end_date', 'is', null)
    .lte('contract_end_date', in30Str)
    .gte('contract_end_date', todayStr)

  for (const c of expiringContracts ?? []) {
    await upsertAlert({
      staff_id: c.staff_id,
      type: 'contract_expiring',
      title: 'Contract expiring soon',
      body:  `Contract ends on ${c.contract_end_date}. Review renewal or separation.`,
      due_date: c.contract_end_date,
      metadata: { contract_id: c.id },
    })
    created.push(`contract_expiring:${c.staff_id}`)
  }

  // 2. Training certificates expiring within 30 days
  const { data: expiringCerts } = await supabaseAdmin
    .from('training_certificates')
    .select('id, staff_id, course_id, expires_at, course:course_id(title)')
    .not('expires_at', 'is', null)
    .lte('expires_at', in30Str)
    .gte('expires_at', todayStr)

  for (const cert of expiringCerts ?? []) {
    const courseTitle = (cert.course as unknown as { title: string } | null)?.title ?? 'Unknown course'
    await upsertAlert({
      staff_id: cert.staff_id,
      type: 'certificate_expiring',
      title: `Certificate expiring: ${courseTitle}`,
      body:  `Your certificate for "${courseTitle}" expires on ${cert.expires_at}.`,
      due_date: cert.expires_at as string,
      metadata: { certificate_id: cert.id, course_id: cert.course_id },
    })
    created.push(`certificate_expiring:${cert.staff_id}`)
  }

  // 3. Overdue onboarding tasks
  const { data: stalledOnboarding } = await supabaseAdmin
    .from('staff_onboarding_tasks')
    .select('id, onboarding_id, staff_onboarding:onboarding_id(staff_id), title, due_date')
    .lt('due_date', todayStr)
    .in('status', ['pending', 'in_progress'])

  for (const task of stalledOnboarding ?? []) {
    const staffId = (task.staff_onboarding as unknown as { staff_id: string } | null)?.staff_id
    if (!staffId) continue
    await upsertAlert({
      staff_id: staffId,
      type: 'onboarding_overdue',
      title: `Onboarding task overdue: ${task.title}`,
      body:  `Task "${task.title}" was due on ${task.due_date} and is not yet completed.`,
      due_date: task.due_date as string,
      metadata: { task_id: task.id, onboarding_id: task.onboarding_id },
    })
    created.push(`onboarding_overdue:${staffId}`)
  }

  // 4. Overdue training assignments
  const { data: overdueTraining } = await supabaseAdmin
    .from('course_assignments')
    .select('id, staff_id, course_id, due_date, course:course_id(title)')
    .lt('due_date', todayStr)
    .in('status', ['pending', 'in_progress'])

  for (const a of overdueTraining ?? []) {
    const courseTitle = (a.course as unknown as { title: string } | null)?.title ?? 'Training'
    await upsertAlert({
      staff_id: a.staff_id,
      type: 'training_overdue',
      title: `Training overdue: ${courseTitle}`,
      body:  `"${courseTitle}" was due on ${a.due_date}.`,
      due_date: a.due_date as string,
      metadata: { assignment_id: a.id, course_id: a.course_id },
    })
    created.push(`training_overdue:${a.staff_id}`)
  }

  // 5. Work anniversaries today
  const mmdd = todayStr.slice(5) // MM-DD
  const { data: staff } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, joined_at')
    .not('joined_at', 'is', null)
    .like('joined_at', `%-${mmdd}`)

  for (const s of staff ?? []) {
    const years = today.getFullYear() - new Date(s.joined_at as string).getFullYear()
    if (years < 1) continue
    await upsertAlert({
      staff_id: s.id,
      type: 'work_anniversary',
      title: `${years}-year anniversary — ${s.name}`,
      body:  `${s.name} celebrates ${years} year${years > 1 ? 's' : ''} at Trescon today.`,
      due_date: todayStr,
      metadata: { years },
    })
    created.push(`work_anniversary:${s.id}`)
  }

  return NextResponse.json({ success: true, checks_run: 5, alerts_created: created.length, detail: created })
}

async function upsertAlert(alert: {
  staff_id: string
  type: string
  title: string
  body: string
  due_date: string
  metadata: Record<string, unknown>
}) {
  // Avoid duplicating open alerts of the same type for the same staff/due_date
  const { data: existing } = await supabaseAdmin
    .from('hr_alerts')
    .select('id')
    .eq('staff_id', alert.staff_id)
    .eq('type', alert.type)
    .eq('due_date', alert.due_date)
    .in('status', ['open', 'acknowledged'])
    .maybeSingle()

  if (existing) return

  await supabaseAdmin.from('hr_alerts').insert({ ...alert, status: 'open' })
}
