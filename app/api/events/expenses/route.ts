import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET    ?event_id=X  — list all expenses for an event
// POST               — add an expense
// PATCH              — update an expense
// DELETE ?id=X       — delete an expense

export async function GET(req: NextRequest) {
  const event_id = new URL(req.url).searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_expenses')
    .select(`
      id, description, amount, expense_currency, exchange_rate, converted_amount,
      expense_date, receipt_ref, notes, created_at,
      vendor_name, po_number, invoice_number, payment_status,
      approval_status, approved_by, approved_at,
      logged_by ( id, name ),
      category:category_id ( id, name, parent_id )
    `)
    .eq('event_id', event_id)
    .order('expense_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    event_id, logged_by, category_id, description,
    amount, expense_currency, exchange_rate, expense_date, receipt_ref, notes,
    vendor_name, po_number, invoice_number, payment_status,
  } = body

  if (!event_id || !description || amount === undefined) {
    return NextResponse.json({ error: 'event_id, description and amount are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('event_expenses')
    .insert({
      event_id,
      logged_by:        logged_by ?? null,
      category_id:      category_id ?? null,
      description:      description.trim(),
      amount:           Number(amount),
      expense_currency: expense_currency ?? 'USD',
      exchange_rate:    Number(exchange_rate ?? 1),
      expense_date:     expense_date ?? null,
      receipt_ref:      receipt_ref ?? null,
      notes:            notes ?? null,
      vendor_name:      vendor_name ?? null,
      po_number:        po_number ?? null,
      invoice_number:   invoice_number ?? null,
      payment_status:   payment_status ?? 'unpaid',
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const allowed = [
    'category_id','description','amount','expense_currency',
    'exchange_rate','expense_date','receipt_ref','notes',
    'vendor_name','po_number','invoice_number','payment_status',
    'approval_status','approved_by','approved_at',
  ]
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (updates[key] !== undefined) patch[key] = updates[key]
  }

  const { data, error } = await supabaseAdmin
    .from('event_expenses')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('event_expenses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
