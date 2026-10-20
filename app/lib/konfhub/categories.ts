import { supabaseAdmin } from '@/app/lib/supabase'

// Per-speaker KonfHub speaker categories (DFWS "Roundtable Speaker"). An event opts in by listing categories on the
// Integrations page (event_websites.konfhub_speaker_categories); with none listed nothing here changes any push.
// See supabase/konfhub_speaker_categories_migration.sql.
export type SpeakerCategoryOption = { id: string; label: string }

export function parseSpeakerCategories(raw: unknown): SpeakerCategoryOption[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(r => {
    const id = typeof r?.id === 'string' || typeof r?.id === 'number' ? String(r.id).trim() : ''
    const label = typeof r?.label === 'string' ? r.label.trim() : ''
    return id && label ? [{ id, label }] : []
  })
}

export async function getEventSpeakerCategories(eventId: string): Promise<SpeakerCategoryOption[]> {
  const { data } = await supabaseAdmin.from('event_websites').select('konfhub_speaker_categories').eq('event_id', eventId).maybeSingle()
  return parseSpeakerCategories(data?.konfhub_speaker_categories)
}

// The category id a push sends. Without a configured list this is the event-level id exactly as before. With a list, a speaker's
// own pick wins; no pick (or one no longer in the list) falls back to the event default. `clear` is true when the list is on
// and nothing applies, so an update must move the speaker back out of any category they were in.
export function resolveSpeakerCategory(
  speakerCategoryId: string | null | undefined, options: SpeakerCategoryOption[], eventDefault: string | null | undefined,
): { categoryId: string | null; clear: boolean } {
  const fallback = eventDefault || null
  if (options.length === 0) return { categoryId: fallback, clear: false }
  const chosen = options.find(o => o.id === speakerCategoryId)?.id ?? fallback
  return { categoryId: chosen, clear: !chosen }
}
