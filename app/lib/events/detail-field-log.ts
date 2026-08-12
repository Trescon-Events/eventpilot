import { supabaseAdmin } from '@/app/lib/supabase'
import { TRACKED_EVENT_FIELDS, ChangeSource } from '@/app/lib/events/detail-fields'

// Shared by the Event Details page's manual-edit save path and the
// Messaging Doc approve endpoint — one place that writes
// event_details_field_changes, so "who changed this field, from what"
// can't drift between the two write paths. See supabase/event_details_page.sql.
// Field-key/label constants live in detail-fields.ts (client-safe — this
// file imports supabaseAdmin and can't be pulled into a browser bundle).

export { TRACKED_EVENT_FIELDS, FIELD_LABELS, type TrackedEventField, type ChangeSource } from '@/app/lib/events/detail-fields'

function normalize(v: unknown): string | null {
  return v === undefined || v === null || v === '' ? null : String(v)
}

// Diffs `before` vs `after` for each tracked key present in `after`,
// inserting one row per actual change. No-op for unchanged or untracked
// keys — safe to call with a full PATCH body, not just the tracked subset.
export async function logEventFieldChanges(
  eventId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  changeSource: ChangeSource,
  changedBy: string | null
): Promise<void> {
  const rows = TRACKED_EVENT_FIELDS
    .filter(key => key in after && normalize(before[key]) !== normalize(after[key]))
    .map(key => ({
      event_id: eventId,
      field_key: key,
      old_value: normalize(before[key]),
      new_value: normalize(after[key]),
      change_source: changeSource,
      changed_by: changedBy,
    }))
  if (rows.length === 0) return

  const { error } = await supabaseAdmin.from('event_details_field_changes').insert(rows)
  if (error) console.error('Failed to log event detail field changes:', error)
}

// public_page_url lives on event_hubspot_forms (per event+form_type), not
// events — namespaced field_key ('hubspot_form:<form_type>:public_page_url')
// disambiguates it in the shared log.
export async function logHubspotPageLinkChange(
  eventId: string, formType: string, before: string | null, after: string | null,
  changeSource: ChangeSource, changedBy: string | null
): Promise<void> {
  if (normalize(before) === normalize(after)) return

  const { error } = await supabaseAdmin.from('event_details_field_changes').insert({
    event_id: eventId,
    field_key: `hubspot_form:${formType}:public_page_url`,
    old_value: normalize(before),
    new_value: normalize(after),
    change_source: changeSource,
    changed_by: changedBy,
  })
  if (error) console.error('Failed to log hubspot page link change:', error)
}
