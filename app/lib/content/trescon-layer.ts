import { supabaseAdmin } from '@/app/lib/supabase'

/* Trescon-wide layer (2026-10-15, docs/build_suggestions/rules-screen-and-trescon-layer.md Part 2).

   Trescon-wide RULES apply to every event. Trescon-wide DOCUMENTS (the house style guide) reach an event only when:
   - the event is Trescon-owned: events.type is not 'managed' (a managed event is a client's contract — DFS, FSF, FIFF, FTF, DFWS, BSS); and
   - its umbrella, if it has one, is not a client umbrella (type 'series' or empty, and no client_name).
   So DFFW children and BSS get the Trescon-wide rules, never the Trescon-wide style guide. */

type UmbrellaFacts = { type: string | null; client_name: string | null }

export function isClientUmbrella(u: UmbrellaFacts | null | undefined): boolean {
  if (!u) return false
  const typeOk = !u.type || u.type === 'series'
  const clientEmpty = !(u.client_name ?? '').trim()
  return !(typeOk && clientEmpty)
}

/** Pure: does the Trescon-wide document layer reach this event? */
export function tresconDocsReach(event: { type: string | null }, umbrella: UmbrellaFacts | null | undefined): boolean {
  if (event.type === 'managed') return false
  return !isClientUmbrella(umbrella)
}

export async function orgDocsReachEvent(eventId: string): Promise<boolean> {
  const { data: ev } = await supabaseAdmin.from('events').select('type, umbrella_id').eq('id', eventId).maybeSingle()
  if (!ev) return false
  let umbrella: UmbrellaFacts | null = null
  if (ev.umbrella_id) {
    const { data } = await supabaseAdmin.from('event_umbrellas').select('type, client_name').eq('id', ev.umbrella_id).maybeSingle()
    umbrella = data
  }
  return tresconDocsReach(ev, umbrella)
}

/** Every event the Trescon-wide documents reach — recompiled when a Trescon-wide document goes live. */
export async function getTresconOwnedEventIds(): Promise<string[]> {
  const [{ data: events }, { data: umbrellas }] = await Promise.all([
    supabaseAdmin.from('events').select('id, type, umbrella_id').neq('type', 'managed'),
    supabaseAdmin.from('event_umbrellas').select('id, type, client_name'),
  ])
  const byId = new Map((umbrellas ?? []).map(u => [u.id as string, u as UmbrellaFacts]))
  return (events ?? [])
    .filter(e => tresconDocsReach(e, e.umbrella_id ? byId.get(e.umbrella_id) : null))
    .map(e => e.id as string)
}
