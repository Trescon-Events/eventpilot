import { supabaseAdmin } from '@/app/lib/supabase'
import { ownerColumn, ownerLabel, type ContentOwnerRef } from './owner'

/* Style notes (docs/build_suggestions/copy-library.md §7): non-checkable writing guidance and event-level style overrides, edited in the Rules screen.
   Generators add the effective notes to their prompt BELOW the client documents in authority. Reads fail open to "no notes" (a missing table changes nothing). */

export type StyleNote = { id: string; event_id: string | null; umbrella_id: string | null; org_scope: string | null; note: string; category: string | null; origin: 'client' | 'trescon'; is_active: boolean; created_at: string }
export const NOTE_COLS = 'id, event_id, umbrella_id, org_scope, note, category, origin, is_active, created_at'
export type NoteLevel = 'org' | 'umbrella' | 'event'

export async function ownersFor(owner: ContentOwnerRef): Promise<Array<{ level: NoteLevel; ref: ContentOwnerRef }>> {
  const out: Array<{ level: NoteLevel; ref: ContentOwnerRef }> = []
  if (owner.kind === 'event') {
    out.push({ level: 'event', ref: owner })
    const { data } = await supabaseAdmin.from('events').select('umbrella_id').eq('id', owner.id).maybeSingle()
    if (data?.umbrella_id) out.push({ level: 'umbrella', ref: { kind: 'umbrella', id: data.umbrella_id } })
  } else if (owner.kind === 'umbrella') out.push({ level: 'umbrella', ref: owner })
  out.push({ level: 'org', ref: { kind: 'org', id: 'trescon' } })
  return out
}

/** Active notes that apply to an owner, Trescon-wide first, then umbrella, then event (the most specific is read last). */
export async function getEffectiveStyleNotes(owner: ContentOwnerRef): Promise<StyleNote[]> {
  try {
    const owners = await ownersFor(owner)
    const sets = await Promise.all(owners.map(async o => {
      const { column, value } = ownerColumn(o.ref)
      const { data, error } = await supabaseAdmin.from('style_notes').select(NOTE_COLS).eq(column, value).eq('is_active', true).order('created_at')
      return error ? [] : ((data ?? []) as StyleNote[])
    }))
    return sets.reverse().flat()
  } catch { return [] }
}

export async function logNoteChange(e: { note_id: string | null; owner: ContentOwnerRef; action: 'create' | 'update' | 'disable' | 'enable'; before: unknown; after: unknown; by: string | null }): Promise<void> {
  const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.by ?? '')
  const { error } = await supabaseAdmin.from('style_note_changes').insert({ note_id: e.note_id, owner: ownerLabel(e.owner), action: e.action, before: e.before ?? null, after: e.after ?? null, changed_by: ok ? e.by : null })
  if (error) throw new Error(`Could not record the style note change: ${error.message}`)
}
