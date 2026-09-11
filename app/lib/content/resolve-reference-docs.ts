import { supabaseAdmin } from '@/app/lib/supabase'
import type { ContentOwnerRef } from './owner'

/* Reference Documents spec, Stage 2 (2026-09-10) — resolver. Rewritten
   2026-09-11 for the umbrella/event structural separation (see
   supabase/umbrella_events_separation_migration.sql) — a document is now
   owned by event_id XOR umbrella_id, and an umbrella lives in its own
   event_umbrellas table, not as another events row.

   Given an event, returns its effective set of governing documents: its
   own live documents, plus every live document on its umbrella, if it has
   one. Given an umbrella directly, just its own live documents — an
   umbrella has no further parent to inherit from. Depth is capped at 2
   (umbrella -> event) by construction: an event's umbrella is looked up
   once and never itself walked further, per the spec ("DFFW is a
   one-level initiative, not a deep tree"). */

export type MessagingDocRow = {
  id: string
  event_id: string | null
  umbrella_id: string | null
  version: number
  title: string
  status: 'draft' | 'live' | 'superseded'
  role: 'style_guide' | 'messaging' | 'production_pack'
  authority_rank: number
  provenance: 'client_approved' | 'trescon_authored'
  structured_json: { sections: Array<Record<string, unknown>>; default_fields?: Record<string, unknown> } | null
  created_at: string
  updated_at: string
}

async function liveDocsFor(column: 'event_id' | 'umbrella_id', id: string): Promise<MessagingDocRow[]> {
  const { data } = await supabaseAdmin.from('event_messaging_docs').select('*').eq(column, id).eq('status', 'live')
  return (data ?? []) as MessagingDocRow[]
}

export async function resolveEffectiveDocs(owner: ContentOwnerRef): Promise<MessagingDocRow[]> {
  if (owner.kind === 'umbrella') {
    return liveDocsFor('umbrella_id', owner.id)
  }

  const { data: event } = await supabaseAdmin.from('events').select('id, umbrella_id').eq('id', owner.id).single()
  if (!event) return []

  const [ownDocs, umbrellaDocs] = await Promise.all([
    liveDocsFor('event_id', event.id),
    event.umbrella_id ? liveDocsFor('umbrella_id', event.umbrella_id) : Promise.resolve([]),
  ])
  return [...ownDocs, ...umbrellaDocs]
}

// Every child event of a given umbrella — used when an umbrella-level
// document is approved and every child's compiled reference needs
// recompiling.
export async function getChildEventIds(umbrellaId: string): Promise<string[]> {
  const { data } = await supabaseAdmin.from('events').select('id').eq('umbrella_id', umbrellaId)
  return (data ?? []).map(e => e.id as string)
}
