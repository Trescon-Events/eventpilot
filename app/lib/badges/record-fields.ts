import { supabaseAdmin } from '@/app/lib/supabase'
import type { BadgeItemRow } from './types'

/* What a badge says according to the person's CURRENT record (speaker record or VIP list): the same fields a batch freezes when it is made. Shared by the batch-wide "Refresh from
   speakers" and the per-badge "Refresh from record" on an approved batch, so both read the record the same way. */

export type RecordFields = { name: string | null; title: string | null; company: string | null; country: string | null; photo_url: string | null; photo_head_box: unknown }

/** item id -> fields from its linked record. A badge whose record is gone (or never linked) is left out of the map. */
export async function recordFieldsFor(items: Pick<BadgeItemRow, 'id' | 'speaker_id' | 'vip_id'>[]): Promise<Map<string, RecordFields>> {
  const ids = items.map(i => i.speaker_id).filter((x): x is string => !!x)
  const vipIds = items.map(i => i.vip_id).filter((x): x is string => !!x)
  const [{ data: speakers }, { data: vips }] = await Promise.all([
    ids.length ? supabaseAdmin.from('event_speakers').select('id, public_name, name, role, company, country, photo_processed_url, photo_head_box').in('id', ids) : Promise.resolve({ data: [] }),
    vipIds.length ? supabaseAdmin.from('event_vips').select('id, name, job_title, company, country, photo_processed_url, photo_head_box').in('id', vipIds) : Promise.resolve({ data: [] }),
  ])
  const out = new Map<string, RecordFields>()
  for (const it of items) {
    const s = (speakers ?? []).find(x => x.id === it.speaker_id)
    const v = (vips ?? []).find(x => x.id === it.vip_id)
    if (s) out.set(it.id, { name: ((s.public_name as string | null) || (s.name as string | null) || '').trim() || null, title: s.role as string | null, company: s.company as string | null, country: s.country as string | null, photo_url: s.photo_processed_url as string | null, photo_head_box: s.photo_head_box })
    else if (v) out.set(it.id, { name: ((v.name as string | null) ?? '').trim() || null, title: v.job_title as string | null, company: v.company as string | null, country: v.country as string | null, photo_url: v.photo_processed_url as string | null, photo_head_box: v.photo_head_box })
  }
  return out
}

export type PrintedChange = { field: 'name' | 'title' | 'company' | 'country' | 'photo'; from: string; to: string }

/** What would change on the printed badge if it were refreshed from its record: compares what the badge says NOW (a manual text change on this badge wins over the frozen value) with the
    record's current text, which a refresh puts back. Empty = the badge already matches its record. */
export function printedChanges(item: Pick<BadgeItemRow, 'name' | 'title' | 'company' | 'country' | 'photo_url' | 'overrides'>, next: RecordFields): PrintedChange[] {
  const out: PrintedChange[] = []
  for (const f of ['name', 'title', 'company', 'country'] as const) {
    const now = (item.overrides?.[f] ?? item[f] ?? '').trim(), to = (next[f] ?? '').trim()
    if (now !== to) out.push({ field: f, from: now, to })
  }
  if ((item.photo_url ?? '') !== (next.photo_url ?? '')) out.push({ field: 'photo', from: item.photo_url ? 'current photo' : 'no photo', to: next.photo_url ? 'updated photo' : 'no photo' })
  return out
}
