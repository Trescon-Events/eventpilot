import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?event_id=X       — payments for an event
// GET  ?status=pending    — filter by status
// GET  ?month=2026-07     — payments for a month
// POST                    — create a payment
// PATCH                   — update status / mark paid

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const event_id = searchParams.get('event_id')
  const status   = searchParams.get('status')
  const month    = searchParams.get('month')

  let q = supabaseAdmin
    .from('vendor_payments')
    .select('*, event:event_id( id, name ), approver:approved_by( id, name )')
    .order('created_at', { ascending: false })

  if (event_id) q = q.eq('event_id', event_id)
  if (status && status !== 'all') q = q.eq('status', status)
  if (month) {
    const [y, m] = month.split('-')
    q = q.gte('due_date', `${y}-${m}-01`).lte('due_date', `${y}-${m}-${new Date(Number(y), Number(m), 0).getDate()}`)
  }

  const { data, error } = await q.limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { event_id, vendor_name, description, invoice_number, amount, currency, category, due_date, notes } = body

  if (!vendor_name || !description || !amount) {
    return NextResponse.json({ error: 'vendor_name, description, and amount required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('vendor_payments')
    .insert({
      event_id:       event_id       ?? null,
      vendor_name,
      description,
      invoice_number: invoice_number ?? null,
      amount,
      currency:       currency       ?? 'USD',
      category:       category       ?? 'other',
      due_date:       due_date       ?? null,
      notes:          notes          ?? null,
      status:         'pending',
    })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, status, approved_by, paid_date, payment_ref, notes } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (status) patch.status = status
  if (status === 'approved') { patch.approved_by = approved_by ?? null; patch.approved_at = new Date().toISOString() }
  if (status === 'paid')     { patch.paid_date = paid_date ?? new Date().toISOString().slice(0, 10); patch.payment_ref = payment_ref ?? null }
  if (notes !== undefined)   patch.notes = notes

  const { data, error } = await supabaseAdmin
    .from('vendor_payments').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
