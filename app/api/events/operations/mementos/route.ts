import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { resolveScope, scopeFromParams } from '@/app/lib/ops/scope'
import { hasSectionAccess } from '@/app/lib/ops/section-access'
import { opsMementoPath } from '@/app/lib/mementos/dispatch'

/* GET /api/events/operations/mementos?event_id= | ?umbrella_id=
   The Mementos list: every hand-off of speaker photos for the events of the scope (an umbrella lists all its events), newest first.
   Gate: admin, ops.mementos.view, or assigned to the Mementos section. */

export async function GET(req: NextRequest) {
  const input = scopeFromParams(req.nextUrl.searchParams)
  // Memento batches belong to ONE event, so an event is never lifted to its umbrella here.
  const scope = await resolveScope(input, { exact: true })
  if (!scope) return NextResponse.json({ error: 'event_id or umbrella_id required' }, { status: 400 })
  if (!(await hasSectionAccess(getSession(req), scope, 'mementos'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  if (!scope.eventIds.length) return NextResponse.json({ scope: { kind: scope.kind, id: scope.id, name: scope.name }, dispatches: [] })

  const { data: batches } = await supabaseAdmin.from('memento_batches').select('id, name, event_id, events(name)').in('event_id', scope.eventIds)
  const ids = (batches ?? []).map(b => b.id as string)
  const { data: rows } = ids.length
    ? await supabaseAdmin.from('memento_dispatches').select('id, batch_id, status, speakers, requested_at, sent_at, vendor_response_at, vendor_id, ops_vendors(name)').in('batch_id', ids).order('requested_at', { ascending: false })
    : { data: [] }
  const byBatch = new Map((batches ?? []).map(b => [b.id as string, b]))
  return NextResponse.json({
    scope: { kind: scope.kind, id: scope.id, name: scope.name },
    dispatches: (rows ?? []).map(r => {
      const b = byBatch.get(r.batch_id as string)!
      const ev = Array.isArray(b.events) ? b.events[0] : b.events
      const vendor = Array.isArray(r.ops_vendors) ? r.ops_vendors[0] : r.ops_vendors
      return {
        id: r.id, batch_id: r.batch_id, batch_name: b.name, event_id: b.event_id, event_name: (ev as { name?: string } | null)?.name ?? '',
        status: r.status, speakers: r.speakers, requested_at: r.requested_at, sent_at: r.sent_at, responded_at: r.vendor_response_at,
        vendor_name: (vendor as { name?: string } | null)?.name ?? null, href: opsMementoPath(b.event_id as string, r.batch_id as string),
      }
    }),
  })
}
