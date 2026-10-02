import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasPlatformPermission } from '@/app/lib/access/event-access'

/* Umbrella/event separation (2026-09-11) — CRUD for event_umbrellas,
   mirroring app/api/events/route.ts's shape for the equivalent event
   operations (GET ?id=, GET list, PATCH ?id=).

   GET /api/events/umbrellas          — list all, each with its child count
   GET /api/events/umbrellas?id=uuid  — one umbrella + its children
   PATCH /api/events/umbrellas?id=uuid — update (e.g. requires_client_approval) */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')

  if (id) {
    const { data, error } = await supabaseAdmin
      .from('event_umbrellas')
      .select('id, name, client_name, status, event_date, end_date, description, type, requires_client_approval, created_at')
      .eq('id', id)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })

    const { data: children } = await supabaseAdmin
      .from('events')
      .select('id, name, type, status, client_name, event_date, end_date')
      .eq('umbrella_id', id)
      .order('name')

    return NextResponse.json({ ...data, children: children ?? [] })
  }

  const { data, error } = await supabaseAdmin
    .from('event_umbrellas')
    .select('id, name, client_name, status, event_date, end_date, created_at, events(count)')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// Columns an edit may change. (The body used to be written straight into the row by any signed-in user.)
const EDITABLE = ['name', 'client_name', 'description', 'status', 'event_date', 'end_date', 'requires_client_approval'] as const

export async function PATCH(req: NextRequest) {
  const id   = req.nextUrl.searchParams.get('id')
  const body = await req.json().catch(() => null)
  if (!id || !body) return NextResponse.json({ error: 'id and body required' }, { status: 400 })

  // Platform admin, or the umbrella-manage permission (the one that governs umbrella-level documents and settings).
  const session = getSession(req)
  if (!session || !(session.adm || (await hasPlatformPermission(session.sid, 'sae.messaging.umbrella_manage')))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const patch: Record<string, unknown> = {}
  for (const k of EDITABLE) if (k in body) patch[k] = body[k] === '' && (k === 'event_date' || k === 'end_date') ? null : body[k]
  if (typeof patch.name === 'string' && !patch.name.trim()) return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 })
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_umbrellas')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
