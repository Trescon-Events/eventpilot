import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { ownerLabel, type ContentOwnerRef } from './owner'
import { buildDateVenueLine, buildAttributionLine, buildFixedCtaLine } from '@/app/lib/events/announcements'

/* Rules screen (2026-10-15) — server helpers shared by the rules API routes: who may change rules at which level, the audit
   trail, and the fixed-line text a new rule is checked against.

   Permissions (docs/build_suggestions/rules-screen-and-trescon-layer.md):
   - event rules:    sae.forms.manage on that event
   - umbrella rules: sae.messaging.umbrella_manage
   - Trescon-wide:   platform admins only (today, Madhu)
   A platform admin may do all three. */

export function parseOwner(type: string | null, id: string | null): ContentOwnerRef | null {
  if (type === 'org') return { kind: 'org', id: 'trescon' }
  if ((type === 'event' || type === 'umbrella') && id) return { kind: type, id }
  return null
}

export async function canManageRules(req: NextRequest, owner: ContentOwnerRef): Promise<{ ok: boolean; sid: string | null }> {
  const session = getSession(req)
  const sid = session?.sid ?? null
  if (!session) return { ok: false, sid }
  if (session.adm) return { ok: true, sid }
  if (owner.kind === 'org') return { ok: false, sid }
  const key = owner.kind === 'umbrella' ? 'sae.messaging.umbrella_manage' : 'sae.forms.manage'
  return { ok: await hasEventPermission(session.sid, owner.id, key), sid }
}

export async function logRuleChange(entry: {
  rule_id: string | null; rule_key: string; owner: ContentOwnerRef
  action: 'create' | 'update' | 'disable' | 'enable' | 'delete'
  before: unknown; after: unknown; changed_by: string | null
}): Promise<void> {
  const { error } = await supabaseAdmin.from('validation_rule_changes').insert({
    rule_id: entry.rule_id, rule_key: entry.rule_key, owner: ownerLabel(entry.owner), action: entry.action,
    before: entry.before ?? null, after: entry.after ?? null, changed_by: entry.changed_by,
  })
  // A change that cannot be recorded must not go through unrecorded: callers await this and surface the failure.
  if (error) throw new Error(`Could not record the rule change: ${error.message}`)
}

type FixedLineEvent = {
  public_dates_display: string | null; public_venue_display: string | null; venue: string | null; city: string | null
  announcement_line_emojis: boolean | null; announcement_attribution_line: string | null; announcement_cta_label: string | null
  registration_url: string | null; event_hashtag: string | null
}
const FIXED_COLS = 'public_dates_display, public_venue_display, venue, city, announcement_line_emojis, announcement_attribution_line, announcement_cta_label, registration_url, event_hashtag'

function fixedTextsOf(e: FixedLineEvent): string[] {
  // The builders take the full EventContext; they only read the fields selected above.
  const ctx = e as unknown as Parameters<typeof buildDateVenueLine>[0]
  return [
    buildDateVenueLine(ctx), e.public_dates_display, e.public_venue_display, buildAttributionLine(ctx), buildFixedCtaLine(ctx), e.event_hashtag,
  ].filter((t): t is string => !!t && !!t.trim())
}

/** The fixed-line text a rule at this level is checked against: the event's own, or its children's / Trescon-owned events' (capped). */
export async function fixedTextsForOwner(owner: ContentOwnerRef): Promise<string[]> {
  if (owner.kind === 'event') {
    const { data } = await supabaseAdmin.from('events').select(FIXED_COLS).eq('id', owner.id).maybeSingle()
    return data ? fixedTextsOf(data as FixedLineEvent) : []
  }
  const q = supabaseAdmin.from('events').select(FIXED_COLS).limit(60)
  const { data } = owner.kind === 'umbrella' ? await q.eq('umbrella_id', owner.id) : await q.not('public_dates_display', 'is', null)
  return (data ?? []).flatMap(e => fixedTextsOf(e as FixedLineEvent))
}
