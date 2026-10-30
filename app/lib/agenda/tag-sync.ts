import { supabaseAdmin } from '@/app/lib/supabase'
import { getKonfhubToken, fetchKonfhubFilters } from '@/app/lib/konfhub-agenda'

/* Picking a KonfHub filter in Agenda mapping copies its tags into event_konfhub_tag_map once. A tag the team adds to that filter on KonfHub later (e.g. BSS "Awards Presented By")
   would otherwise never reach EventPilot, so the Agenda Builder and the push call this first: every tag of a filter that is already mapped to a field (and only to one) and is missing from
   the copy is added. Never removes or renames anything, never touches KonfHub, and never throws — a KonfHub hiccup just leaves the copy as it was. Returns how many tags were added. */
export async function syncNewFilterTags(eventId: string): Promise<number> {
  try {
    const [{ data: site }, { data: map }] = await Promise.all([
      supabaseAdmin.from('event_websites').select('konfhub_event_id, konfhub_client_id, konfhub_client_secret').eq('event_id', eventId).maybeSingle(),
      supabaseAdmin.from('event_konfhub_tag_map').select('kind, tag_id').eq('event_id', eventId),
    ])
    if (!site?.konfhub_event_id || !site.konfhub_client_id || !site.konfhub_client_secret || !map?.length) return 0
    const filters = await fetchKonfhubFilters(site.konfhub_event_id, await getKonfhubToken(site.konfhub_client_id, site.konfhub_client_secret))
    const have = new Set(map.map(r => r.tag_id as string))
    const rows: { event_id: string; kind: string; label: string; tag_id: string }[] = []
    for (const f of filters) {
      const kinds = [...new Set(map.filter(r => f.tags.some(t => t.id === r.tag_id)).map(r => r.kind as string))]
      if (kinds.length !== 1) continue   // unmapped filter, or tags split across fields: leave it to the person who set the mapping
      for (const t of f.tags) if (!have.has(t.id)) rows.push({ event_id: eventId, kind: kinds[0], label: t.name, tag_id: t.id })
    }
    if (!rows.length) return 0
    const { error } = await supabaseAdmin.from('event_konfhub_tag_map').insert(rows)
    return error ? 0 : rows.length
  } catch { return 0 }
}
