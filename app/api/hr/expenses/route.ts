import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?staff_id=X      — my claims
// GET  ?pending=true     — pending approvals (manager view)
// GET  ?event_id=X       — claims for an event
// GET  ?month=2026-07    — all claims for a month
// POST                   — submit a claim
// PATCH                  — approve/reject/mark paid

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const staff_id = searchParams.get('staff_id')
  const pending  = searchParams.get('pending') === 'true'
  const event_id = searchParams.get('event_id')
  const month    = searchParams.get('month')

  let q = supabaseAdmin
    .from('expense_claims')
    .select('*, staff:staff_id( id, name, department ), event:event_id( id, name ), approver:approved_by( id, name )')
    .order('created_at', { ascending: false })

  if (staff_id) q = q.eq('staff_id', staff_id)
  if (pending)  q = q.eq('status', 'pending')
  if (event_id) q = q.eq('event_id', event_id)
  if (month) {
    const [y, m] = month.split('-')
    q = q.gte('expense_date', `${y}-${m}-01`).lte('expense_date', `${y}-${m}-${new Date(Number(y), Number(m), 0).getDate()}`)
  }

  const { data, error } = await q.limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { staff_id, event_id, category, description, amount, currency, receipt_url, expense_date } = body

  if (!staff_id || !category || !description || !amount) {
    return NextResponse.json({ error: 'staff_id, category, description, and amount required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('expense_claims')
    .insert({
      staff_id,
      event_id:     event_id     ?? null,
      category,
      description,
      amount,
      currency:     currency     ?? 'USD',
      receipt_url:  receipt_url  ?? null,
      expense_date: expense_date ?? new Date().toISOString().slice(0, 10),
      status:       'pending',
    })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, status, approved_by, rejection_reason, payment_ref } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (status) patch.status = status
  if (status === 'approved') { patch.approved_by = approved_by ?? null; patch.approved_at = new Date().toISOString() }
  if (status === 'rejected') { patch.rejection_reason = rejection_reason ?? null; patch.approved_by = approved_by ?? null; patch.approved_at = new Date().toISOString() }
  if (status === 'paid')     { patch.paid_at = new Date().toISOString(); patch.payment_ref = payment_ref ?? null }

  const { data, error } = await supabaseAdmin
    .from('expense_claims').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
