import { supabaseAdmin } from '@/app/lib/supabase'

// Per-event KonfHub speaker roles (Speaker, Moderator, Roundtable Chair, ...),
// picked from the event's KonfHub tags on the Integrations page. See
// supabase/konfhub_multi_role_migration.sql for why a role beyond the main
// record's own needs a separate KonfHub speaker record (one per role).
export type KonfhubRole = { tag_id: string; label: string; sort_order: number }

export async function getEventRoles(eventId: string): Promise<KonfhubRole[]> {
  const { data } = await supabaseAdmin
    .from('event_konfhub_roles')
    .select('tag_id, label, sort_order')
    .eq('event_id', eventId)
    .order('sort_order')
    .order('label')
  return (data ?? []) as KonfhubRole[]
}

// The role the main (Overview) record carries. An explicitly chosen role wins
// as long as it's still one of the event's roles; otherwise fall back to the
// role labelled "Speaker", then the first role. Null only when the event has
// no roles configured yet (the push then leaves KonfHub's tags untouched).
export function resolvePrimaryRole(primaryTagId: string | null | undefined, roles: KonfhubRole[]): KonfhubRole | null {
  if (primaryTagId) {
    const chosen = roles.find(r => r.tag_id === primaryTagId)
    if (chosen) return chosen
  }
  return roles.find(r => r.label.trim().toLowerCase() === 'speaker') ?? roles[0] ?? null
}
