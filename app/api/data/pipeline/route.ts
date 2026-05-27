import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* GET  /api/data/pipeline?contact_id=  or  ?event_id=  or  ?assigned_to=
   POST /api/data/pipeline — create pipeline entry
   PATCH /api/data/pipeline — update stage/notes/assignment
*/

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const contactId  = searchParams.get('contact_id')
  const eventId    = searchParams.get('event_id')
  const assignedTo = searchParams.get('assigned_to')
  const stage      = searchParams.get('stage')

  let query = supabaseAdmin
    .from('sd_contact_pipeline')
    .select(`
      *,
      sd_contact_records(id, property_values, linkedin_url),
      staff_members!assigned_to(id, name, role)
    `)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (contactId)  query = query.eq('contact_id', contactId)
  if (eventId)    query = query.eq('event_id', eventId)
  if (assignedTo) query = query.eq('assigned_to', assignedTo)
  if (stage)      query = query.eq('stage', stage)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { contact_id, event_id, event_name, stage, assigned_to, notes, next_action_date, created_by } =
    await req.json().catch(() => ({}))

  if (!contact_id) return NextResponse.json({ error: 'contact_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('sd_contact_pipeline')
    .upsert({
      contact_id,
      event_id:        event_id ?? null,
      event_name:      event_name ?? null,
      stage:           stage ?? 'prospect',
      assigned_to:     assigned_to ?? null,
      notes:           notes ?? null,
      next_action_date: next_action_date ?? null,
      created_by:      created_by ?? null,
      updated_at:      new Date().toISOString(),
    }, { onConflict: 'contact_id,event_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const { id, stage, assigned_to, notes, next_action_date } =
    await req.json().catch(() => ({}))

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (stage !== undefined)            update.stage           = stage
  if (assigned_to !== undefined)      update.assigned_to     = assigned_to
  if (notes !== undefined)            update.notes           = notes
  if (next_action_date !== undefined) update.next_action_date = next_action_date

  const { data, error } = await supabaseAdmin
    .from('sd_contact_pipeline')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
