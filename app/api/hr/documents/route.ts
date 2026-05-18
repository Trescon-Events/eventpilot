import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?staff_id=X          — all HR documents for a staff member
// GET  ?expiring=true       — docs expiring within 60 days (visas, IDs, etc.)
// POST                      — add document metadata
// PATCH                     — update document
// DELETE ?id=X              — remove a document record

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const staff_id = searchParams.get('staff_id')
  const expiring = searchParams.get('expiring') === 'true'

  if (expiring) {
    const in60 = new Date(); in60.setDate(in60.getDate() + 60)
    const { data, error } = await supabaseAdmin
      .from('staff_hr_documents')
      .select('*, staff:staff_id( id, name, department )')
      .not('expiry_date', 'is', null)
      .lte('expiry_date', in60.toISOString().slice(0, 10))
      .gte('expiry_date', new Date().toISOString().slice(0, 10))
      .order('expiry_date')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (!staff_id) return NextResponse.json({ error: 'staff_id or expiring=true required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('staff_hr_documents')
    .select('*')
    .eq('staff_id', staff_id)
    .order('doc_type')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { staff_id, doc_type, title, file_url, file_name, issued_date, expiry_date, uploaded_by, notes } = body

  if (!staff_id || !doc_type || !title) {
    return NextResponse.json({ error: 'staff_id, doc_type, and title required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('staff_hr_documents')
    .insert({
      staff_id, doc_type, title,
      file_url:     file_url     ?? null,
      file_name:    file_name    ?? null,
      issued_date:  issued_date  ?? null,
      expiry_date:  expiry_date  ?? null,
      uploaded_by:  uploaded_by  ?? null,
      notes:        notes        ?? null,
    })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['title','file_url','file_name','issued_date','expiry_date','notes','doc_type']
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (updates[k] !== undefined) patch[k] = updates[k]

  const { data, error } = await supabaseAdmin
    .from('staff_hr_documents').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('staff_hr_documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
