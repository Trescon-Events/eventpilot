import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?staff_id=X       — requests by a staff member
// GET  ?manager_id=X     — requests from staff reporting to this manager (approval queue)
// GET  ?status=pending   — filter by status
// POST                   — submit a leave request
// PATCH                  — approve / reject / cancel

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const staff_id   = searchParams.get('staff_id')
  const manager_id = searchParams.get('manager_id')
  const status     = searchParams.get('status')

  let query = supabaseAdmin
    .from('staff_leave_requests')
    .select(`
      *,
      staff:staff_id ( id, name, department, office_id ),
      leave_type:leave_type_id ( id, name, code, is_paid ),
      reviewed_by:reviewed_by ( id, name )
    `)
    .order('created_at', { ascending: false })

  if (staff_id)   query = query.eq('staff_id', staff_id)
  if (status)     query = query.eq('status', status)

  if (manager_id) {
    // Get all staff reporting to this manager
    const { data: reports } = await supabaseAdmin
      .from('staff_members').select('id').eq('manager_id', manager_id)
    const ids = (reports ?? []).map(r => r.id)
    if (ids.length === 0) return NextResponse.json([])
    query = query.in('staff_id', ids)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { staff_id, leave_type_id, start_date, end_date, reason } = body

  if (!staff_id || !leave_type_id || !start_date || !end_date) {
    return NextResponse.json({ error: 'staff_id, leave_type_id, start_date, end_date required' }, { status: 400 })
  }

  // Calculate working days (exclude weekends)
  const start = new Date(start_date)
  const end   = new Date(end_date)
  let days = 0
  const cur = new Date(start)
  while (cur <= end) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) days++
    cur.setDate(cur.getDate() + 1)
  }

  // Check balance
  const year = start.getFullYear()
  const { data: balance } = await supabaseAdmin
    .from('staff_leave_balances')
    .select('entitled_days, used_days, pending_days, carried_over')
    .eq('staff_id', staff_id).eq('leave_type_id', leave_type_id).eq('year', year)
    .maybeSingle()

  if (balance) {
    const available = (balance.entitled_days + balance.carried_over) - balance.used_days - balance.pending_days
    if (days > available) {
      return NextResponse.json({ error: `Insufficient leave balance. Available: ${available} days, Requested: ${days} days.` }, { status: 422 })
    }
  }

  const { data, error } = await supabaseAdmin
    .from('staff_leave_requests')
    .insert({ staff_id, leave_type_id, start_date, end_date, total_days: days, reason: reason ?? null })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update pending_days in balance
  if (balance) {
    await supabaseAdmin
      .from('staff_leave_balances')
      .update({ pending_days: balance.pending_days + days, updated_at: new Date().toISOString() })
      .eq('staff_id', staff_id).eq('leave_type_id', leave_type_id).eq('year', year)
  }

  // Notify manager
  const { data: staff } = await supabaseAdmin
    .from('staff_members').select('name, manager_id').eq('id', staff_id).single()
  if (staff?.manager_id) {
    await supabaseAdmin.from('notifications').insert({
      staff_id: staff.manager_id,
      type:     'leave_request',
      title:    'Leave request pending your approval',
      body:     `${staff.name} has requested ${days} day(s) of leave from ${start_date} to ${end_date}.`,
      read:     false,
    })
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, status, reviewed_by, review_note } = body
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })

  const { data: request } = await supabaseAdmin
    .from('staff_leave_requests').select('*').eq('id', id).single()
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const { data, error } = await supabaseAdmin
    .from('staff_leave_requests')
    .update({ status, reviewed_by: reviewed_by ?? null, review_note: review_note ?? null, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const year = new Date(request.start_date).getFullYear()

  // Update balances based on decision
  if (status === 'approved') {
    const { data: bal } = await supabaseAdmin
      .from('staff_leave_balances')
      .select('used_days, pending_days')
      .eq('staff_id', request.staff_id).eq('leave_type_id', request.leave_type_id).eq('year', year)
      .maybeSingle()
    if (bal) {
      await supabaseAdmin.from('staff_leave_balances').update({
        used_days:    bal.used_days    + request.total_days,
        pending_days: Math.max(0, bal.pending_days - request.total_days),
        updated_at:   new Date().toISOString(),
      }).eq('staff_id', request.staff_id).eq('leave_type_id', request.leave_type_id).eq('year', year)
    }
  } else if (status === 'rejected' || status === 'cancelled') {
    // Release pending days
    const { data: bal } = await supabaseAdmin
      .from('staff_leave_balances')
      .select('pending_days')
      .eq('staff_id', request.staff_id).eq('leave_type_id', request.leave_type_id).eq('year', year)
      .maybeSingle()
    if (bal) {
      await supabaseAdmin.from('staff_leave_balances').update({
        pending_days: Math.max(0, bal.pending_days - request.total_days),
        updated_at:   new Date().toISOString(),
      }).eq('staff_id', request.staff_id).eq('leave_type_id', request.leave_type_id).eq('year', year)
    }
  }

  // Notify staff
  await supabaseAdmin.from('notifications').insert({
    staff_id: request.staff_id,
    type:     'leave_decision',
    title:    `Leave request ${status}`,
    body:     `Your leave request for ${request.total_days} day(s) has been ${status}.${review_note ? ` Note: ${review_note}` : ''}`,
    read:     false,
  })

  return NextResponse.json(data)
}
